import { createHmac, createPublicKey, createVerify } from "crypto";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Environment Variables
const REGION = process.env.REGION || process.env.AWS_REGION || "us-west-2";
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;
const COGNITO_URL = process.env.COGNITO_URL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const USER_POOL_ID = process.env.USER_POOL_ID;

const lambdaClient = new LambdaClient({ region: REGION });

// CORS Configuration (espejo de sign-in.mjs)
const ALLOWED_ORIGINS = [
    "https://webview-sportsbook.casinoatlanticcity.com",
    "https://app-altenar.acity.com.pe",
    "https://acity.com.pe",
    "https://casinoatlanticcity.com",
    "https://altenar-webview.netlify.app",
    "https://altenar-qa-stark2.netlify.app",
    "https://altenar-app.acity.com.pe",
    "https://test-altenar.netlify.app",
    "http://localhost:3014/",
];

function getCorsHeaders(origin) {
    const allowedOrigin = origin && (
        ALLOWED_ORIGINS.includes(origin) ||
        origin.startsWith("http://localhost") ||
        origin.includes("acity.com") ||
        origin.includes("casinoatlanticcity.com")
    ) ? origin : "https://webview-sportsbook.casinoatlanticcity.com";

    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Theme, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
    };
}

function createResponse(statusCode, data, origin) {
    return {
        statusCode,
        headers: getCorsHeaders(origin),
        body: JSON.stringify(data)
    };
}

// ============================================================================
// JWT signature validation (sin librerías externas — usa crypto nativo de Node)
//
// Por qué validamos a mano: este endpoint es PÚBLICO (sin Cognito Authorizer
// en API Gateway), porque el cliente nos llama justamente cuando su IdToken
// expiró. El authorizer lo rechazaría. Validamos la FIRMA del JWT con la
// clave pública de Cognito, pero IGNORAMOS el claim `exp` — es esperado que
// venga expirado.
// ============================================================================

let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hora

function base64UrlDecode(str) {
    return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function getJwks() {
    if (jwksCache && Date.now() - jwksCacheTime < JWKS_TTL_MS) {
        return jwksCache;
    }
    const jwksUrl = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
    console.log("[renew] fetching JWKs from", jwksUrl);
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new Error(`JWKs fetch failed: HTTP ${res.status}`);
    const jwks = await res.json();
    jwksCache = jwks;
    jwksCacheTime = Date.now();
    return jwks;
}

/**
 * Valida la firma de un JWT contra las JWKs públicas de Cognito.
 * NO valida `exp` — el IdToken puede venir expirado, es el caso esperado.
 * SÍ valida: kid presente, signing key encontrada, issuer, audience, token_use.
 *
 * @returns el payload (claims) del JWT si la firma es válida.
 * @throws si la firma no se puede validar o las validaciones extra fallan.
 */
async function verifyJwtSignature(token) {
    if (!token || typeof token !== "string") {
        throw new Error("token is not a string");
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("token does not have 3 segments");
    }
    const [headerB64, payloadB64, signatureB64] = parts;

    let header, payload;
    try {
        header = JSON.parse(base64UrlDecode(headerB64).toString());
        payload = JSON.parse(base64UrlDecode(payloadB64).toString());
    } catch {
        throw new Error("token header/payload not valid base64 JSON");
    }

    if (!header.kid) throw new Error("token header missing kid");
    if (header.alg !== "RS256") throw new Error(`unsupported alg: ${header.alg}`);

    const jwks = await getJwks();
    const jwk = jwks.keys?.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error(`signing key not found for kid: ${header.kid}`);

    // Construye una public key desde el JWK
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });

    // Verifica la firma sobre `header.payload` con SHA256
    const signedData = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(signedData);
    const valid = verifier.verify(publicKey, signature);

    if (!valid) throw new Error("signature verification failed");

    // Validaciones adicionales (sin exp)
    const expectedIss = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
    if (payload.iss !== expectedIss) {
        throw new Error(`unexpected iss: ${payload.iss}`);
    }
    if (payload.aud !== CLIENT_ID) {
        throw new Error(`unexpected aud: ${payload.aud}`);
    }
    if (payload.token_use !== "id") {
        throw new Error(`unexpected token_use: ${payload.token_use}`);
    }

    return payload;
}

// ============================================================================
// Lambda invocation helper
// ============================================================================

async function invokeLambda(functionName, payload) {
    const t0 = Date.now();
    try {
        const mode = payload?.mode;
        const payloadLen = typeof payload?.payload === "string" ? payload.payload.length : 0;
        console.log(`[invokeLambda] → ${functionName}`, { mode, payloadLen });

        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify(payload)
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        const dt = Date.now() - t0;

        if (response.FunctionError) {
            console.error(`[invokeLambda] ← ${functionName} FunctionError`, {
                FunctionError: response.FunctionError,
                payload: result,
                durationMs: dt
            });
        } else {
            console.log(`[invokeLambda] ← ${functionName} OK`, {
                durationMs: dt,
                statusCode: result?.statusCode,
                body_len: typeof result?.body === "string" ? result.body.length : null
            });
        }

        return result;
    } catch (error) {
        console.error(`[invokeLambda] ${functionName} threw`, {
            name: error?.name,
            message: error?.message,
            durationMs: Date.now() - t0,
            stack: error?.stack
        });
        throw error;
    }
}

// ============================================================================
// Calimaco API calls
// ============================================================================

async function callCalimacoRefresh(deviceId, refreshTokenPlain) {
    try {
        const body = new URLSearchParams({
            company: "ACP",
            device_id: deviceId,
            refresh_token: refreshTokenPlain
        });

        console.log("[renew] Calling Calimaco token refresh API");

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/token/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });

        const rawBody = await response.text();
        let data;
        try {
            data = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            data = rawBody;
        }

        console.log("[renew] Calimaco refresh response:", response.status, JSON.stringify(data));

        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("[renew] Error calling Calimaco refresh:", error);
        throw error;
    }
}

async function callGetUserDetail(session) {
    try {
        const body = new URLSearchParams({ company: "ACP", session });

        const response = await fetch(`${CALIMACO_BASE_URL}/data/getUserDetails`, {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: body.toString()
        });

        const data = await response.json();
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("[renew] Error calling getUserDetails:", error);
        return { ok: false, status: 500, data: { message: "Error getting user details" } };
    }
}

// ============================================================================
// Cognito custom auth flow (igual que sign-in.mjs)
// ============================================================================

function generateSecretHash(username) {
    const message = username + CLIENT_ID;
    const hmac = createHmac("sha256", CLIENT_SECRET);
    hmac.update(message);
    return hmac.digest("base64");
}

async function callInitAuth(clientId, username, secretHash) {
    const body = {
        AuthFlow: "CUSTOM_AUTH",
        ClientId: clientId,
        AuthParameters: { USERNAME: username, SECRET_HASH: secretHash }
    };

    console.log("[renew] Calling Cognito InitiateAuth");

    const response = await fetch(COGNITO_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("[renew] InitiateAuth response:", JSON.stringify(data));

    return { ok: response.ok, status: response.status, data };
}

async function callRespondToAuthChallenge(clientId, username, answer, secretHash, session, clientMetadata) {
    const body = {
        ChallengeName: "CUSTOM_CHALLENGE",
        ClientId: clientId,
        ChallengeResponses: { USERNAME: username, ANSWER: answer, SECRET_HASH: secretHash },
        Session: session
    };

    if (clientMetadata && Object.keys(clientMetadata).length > 0) {
        body.ClientMetadata = clientMetadata;
    }

    console.log("[renew] Calling Cognito RespondToAuthChallenge");

    const response = await fetch(COGNITO_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.RespondToAuthChallenge"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("[renew] RespondToAuthChallenge response:", JSON.stringify(data));

    return { ok: response.ok, status: response.status, data };
}

// ============================================================================
// Handler
// ============================================================================

export const lambda_handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin;

    console.log("[renew] Event received");
    console.log("[renew] Origin:", origin);

    try {
        // OPTIONS preflight
        if (event.httpMethod === "OPTIONS") {
            return createResponse(200, { message: "CORS preflight successful" }, origin);
        }

        // ===========================================================
        // STEP 1: Extraer Bearer del Authorization header
        // ===========================================================
        console.log("[renew] STEP 1/7 — Extract Bearer token");

        const authHeader = event.headers?.Authorization || event.headers?.authorization || "";
        const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

        if (!bearerMatch) {
            console.warn("[renew] STEP 1 FAIL — no Authorization Bearer header");
            return createResponse(401, { message: "Authorization Bearer header is required" }, origin);
        }

        const idToken = bearerMatch[1].trim();
        console.log("[renew] STEP 1 OK — bearer extracted, len=" + idToken.length);

        // ===========================================================
        // STEP 2: Validar firma del JWT (sin chequear exp)
        // ===========================================================
        console.log("[renew] STEP 2/7 — Verify JWT signature (ignoring exp)");

        let claims;
        try {
            claims = await verifyJwtSignature(idToken);
        } catch (verifyErr) {
            console.warn("[renew] STEP 2 FAIL — JWT signature verification failed", {
                message: verifyErr?.message
            });
            return createResponse(401, {
                message: "Invalid IdToken",
                reason: verifyErr?.message
            }, origin);
        }

        const username = claims["cognito:username"] || claims.username;
        const encryptedRefreshToken = claims.refresh_token_col;
        const deviceId = claims.device_id;

        console.log("[renew] STEP 2 OK", {
            cognito_username: username,
            has_refresh_token_col: Boolean(encryptedRefreshToken),
            has_device_id: Boolean(deviceId),
            device_id: deviceId
        });

        if (!username) {
            return createResponse(401, { message: "IdToken missing username claim" }, origin);
        }
        if (!encryptedRefreshToken || !deviceId) {
            return createResponse(400, {
                message: "IdToken was not issued with remember_me. Please sign in again."
            }, origin);
        }

        // ===========================================================
        // STEP 3: Decifrar refresh_token con FN_CRYPTO
        // ===========================================================
        console.log("[renew] STEP 3/7 — Decrypt refresh_token via FN_CRYPTO");

        const decryptResult = await invokeLambda(FN_CRYPTO, {
            mode: "decrypt",
            payload: encryptedRefreshToken
        });
        const refreshTokenPlain = decryptResult?.body || "";

        if (!refreshTokenPlain) {
            console.error("[renew] STEP 3 FAIL — could not decrypt refresh_token", { decryptResult });
            return createResponse(401, { message: "Could not decrypt refresh_token" }, origin);
        }
        console.log("[renew] STEP 3 OK — refresh_token decrypted, len=" + refreshTokenPlain.length);

        // ===========================================================
        // STEP 4: Llamar a Calimaco refresh (rota refresh_token)
        // ===========================================================
        console.log("[renew] STEP 4/7 — Calimaco /auth/token/refresh");

        const refreshResult = await callCalimacoRefresh(deviceId, refreshTokenPlain);

        if (!refreshResult.ok || refreshResult.data?.result !== "OK") {
            console.warn("[renew] STEP 4 FAIL — Calimaco rejected refresh", {
                status: refreshResult.status,
                code: refreshResult.data?.code,
                description: refreshResult.data?.description
            });
            return createResponse(401, {
                message: "Refresh token inválido o expirado",
                code: refreshResult.data?.code,
                description: refreshResult.data?.description
            }, origin);
        }

        const calimacoUser = refreshResult.data.user || {};
        const newSessionToken = calimacoUser.session;
        const calimacoUsername = calimacoUser.alias;
        const newRememberMe = refreshResult.data?.data?.remember_me || null;

        if (!newSessionToken || !calimacoUsername) {
            console.error("[renew] STEP 4 FAIL — Calimaco OK but missing session/alias");
            return createResponse(500, { message: "Respuesta de Calimaco inválida" }, origin);
        }

        // ===========================================================
        // STEP 5: Cifrar session + refresh_token NUEVO + getUserDetails (paralelo)
        // ===========================================================
        const newRefreshTokenPlain = newRememberMe?.refresh_token || "";
        const newDeviceId = newRememberMe?.device_id || deviceId;

        console.log("[renew] STEP 4 OK", {
            calimaco_alias: calimacoUsername,
            cognito_username: username,
            usernames_match: username === calimacoUsername,
            new_session_present: Boolean(newSessionToken),
            new_remember_me_present: Boolean(newRememberMe),
            new_device_id: newDeviceId
        });

        console.log("[renew] STEP 5/7 — Parallel encrypt + getUserDetails");

        let encSessionResult, encRefreshResult, detailResult;
        try {
            [encSessionResult, encRefreshResult, detailResult] = await Promise.all([
                invokeLambda(FN_CRYPTO, { mode: "encrypt", payload: newSessionToken }),
                newRefreshTokenPlain
                    ? invokeLambda(FN_CRYPTO, { mode: "encrypt", payload: newRefreshTokenPlain })
                    : Promise.resolve({ body: "" }),
                callGetUserDetail(newSessionToken)
            ]);
        } catch (parallelErr) {
            console.error("[renew] STEP 5 FAIL — Promise.all rejected", {
                name: parallelErr?.name,
                message: parallelErr?.message,
                stack: parallelErr?.stack
            });
            throw parallelErr;
        }

        const encryptedNewSession = encSessionResult.body || "";
        const encryptedNewRefreshToken = encRefreshResult.body || "";
        const calimacoDetailData = detailResult.data?.user || {};

        console.log("[renew] STEP 5 OK");

        // ===========================================================
        // STEP 6: Cognito InitiateAuth
        // ===========================================================
        console.log("[renew] STEP 6/7 — Cognito InitiateAuth", {
            cognito_username: username,
            calimaco_alias: calimacoUsername
        });

        const secretHash = generateSecretHash(username);
        const initAuthResult = await callInitAuth(CLIENT_ID, username, secretHash);

        if (!initAuthResult.ok) {
            console.error("[renew] STEP 6 FAIL — InitAuth no OK", {
                status: initAuthResult.status,
                data: initAuthResult.data
            });
            return createResponse(500, { message: "Error inicializando autenticación" }, origin);
        }

        const cognitoSession = initAuthResult.data.Session;
        console.log("[renew] STEP 6 OK");

        // ===========================================================
        // STEP 7: RespondToAuthChallenge con ClientMetadata (claims nuevas)
        // ===========================================================
        const clientMetadata = {};
        if (encryptedNewRefreshToken) clientMetadata.refresh_token_col = encryptedNewRefreshToken;
        if (newDeviceId) clientMetadata.device_id = newDeviceId;

        console.log("[renew] STEP 7/7 — RespondToAuthChallenge", {
            cognito_username: username,
            clientMetadata_keys: Object.keys(clientMetadata),
            has_new_refresh_token: Boolean(encryptedNewRefreshToken),
            new_device_id: newDeviceId
        });

        const authResult = await callRespondToAuthChallenge(
            CLIENT_ID,
            username,
            encryptedNewSession,
            secretHash,
            cognitoSession,
            clientMetadata
        );

        if (!authResult.ok) {
            console.error("[renew] STEP 7 FAIL — RespondToAuthChallenge no OK", {
                status: authResult.status,
                data: authResult.data
            });
            return createResponse(500, { message: "Error completando autenticación" }, origin);
        }

        const authData = authResult.data.AuthenticationResult || {};
        console.log("[renew] DONE — refresh successful", {
            cognito_username: username,
            calimaco_alias: calimacoUsername,
            has_id_token: Boolean(authData.IdToken),
            has_refresh_token: Boolean(authData.RefreshToken),
            expires_in: authData.ExpiresIn
        });
        // [DEV] log new IdToken for Postman testing — remove before prod
        console.log("[renew][DEV] new IdToken:", authData.IdToken);

        // Respuesta: solo Cognito tokens + user. El nuevo refresh_token vive
        // DENTRO del IdToken como claim (cifrada). El cliente solo guarda
        // el IdToken como Bearer opaco.
        return createResponse(200, {
            AccessToken: authData.AccessToken,
            IdToken: authData.IdToken,
            RefreshToken: authData.RefreshToken,
            ExpiresIn: authData.ExpiresIn,
            user: {
                alias: calimacoUser.alias,
                user: calimacoUser.user,
                email: calimacoUser.email,
                status: calimacoUser.status,
                db: calimacoUser.db,
                country: calimacoUser.country,
                lastLogin: calimacoUser.lastLogin,
                company: calimacoUser.company,
                national_id: calimacoUser.national_id,
                ip_login_errors: calimacoUser.ip_login_errors,
                otp: calimacoUser.otp,
                facebook_id: calimacoUser.facebook_id,
                google_id: calimacoUser.google_id,
                client_device: calimacoUser.client_device,
                groups: calimacoDetailData.groups ?? calimacoUser.groups,
                currency: calimacoDetailData.currency,
                birthday: calimacoDetailData.birthday,
                gender: calimacoDetailData.gender,
                national_id_type: calimacoDetailData.national_id_type
            }
        }, origin);

    } catch (error) {
        console.error("[renew] UNHANDLED ERROR", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return createResponse(500, { message: "Ocurrió un error inesperado" }, origin);
    }
};
