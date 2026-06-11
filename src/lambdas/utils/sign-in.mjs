import { createHmac } from "crypto";
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Environment Variables
const COGNITO_URL = process.env.COGNITO_URL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const FN_CRYPTO = process.env.FN_CRYPTO;
const USER_POOL_ID = process.env.USER_POOL_ID;
const REGION = process.env.AWS_REGION || "us-west-2";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

// CORS Configuration
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

// Invoke Lambda - Requiere AWS SDK porque necesita firma de credenciales
async function invokeLambda(functionName, payload) {
    const t0 = Date.now();
    try {
        // Por seguridad NO logueamos el payload completo (puede contener secretos).
        // Solo logueamos el modo y la longitud.
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

        // FunctionError es lo que el SDK devuelve cuando la lambda invocada lanza excepción
        if (response.FunctionError) {
            console.error(`[invokeLambda] ← ${functionName} returned FunctionError`, {
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

// Cognito User Management - Requiere AWS SDK porque necesita firma de credenciales
async function userExists(username) {
    try {
        const command = new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username
        });

        await cognitoClient.send(command);
        return true;
    } catch (error) {
        if (error.name === "UserNotFoundException") {
            return false;
        }
        console.error("Error checking user existence:", error);
        throw error;
    }
}

async function createUserInCognito(username, password) {
    try {
        console.log("Creating user in Cognito:", username);

        // Create user
        const createCommand = new AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            MessageAction: "SUPPRESS"
        });

        await cognitoClient.send(createCommand);

        // Set password
        const setPasswordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            Password: password,
            Permanent: true
        });

        await cognitoClient.send(setPasswordCommand);

        console.log("User created successfully in Cognito");
    } catch (error) {
        console.error("Error creating user in Cognito:", error);
        throw error;
    }
}

// Calimaco API calls
async function callCalimacoLogin(username, password, theme = "casino", rememberMe = false, deviceName) {
    try {
        const params = {
            company: "ACP",
            alias: username,
            password: password
        };

        if (rememberMe) {
            params.remember_me = "true";
            if (deviceName) params.device_name = deviceName;
        }

        const body = new URLSearchParams(params);

        console.log("Calling Calimaco login API (remember_me=" + rememberMe + ")");

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });

        // VALIDACIÓN HTTP — evita el SyntaxError "Unexpected token < in JSON"
        // cuando upstream/Cloudflare devuelve HTML en vez de JSON.
        if (!response.ok) {
            const errorText = await response.text();
            console.error(JSON.stringify({
                layer: "Auth",
                action: "CalimacoLoginHttpError",
                message: "Calimaco respondió con código HTTP de error (no 2xx)",
                metadata: {
                    user: username,
                    statusCode: response.status,
                    statusText: response.statusText,
                    contentType: response.headers.get("content-type"),
                    cfRay: response.headers.get("cf-ray"),
                    server: response.headers.get("server"),
                    cfMitigated: response.headers.get("cf-mitigated"),
                    serverResponseSample: errorText.slice(0, 500)
                }
            }));
            throw new Error("Error de comunicación con el servicio de login");
        }

        // El status es 2xx — todavía puede ser HTML (raro pero pasa).
        // Leemos texto primero y parseamos a JSON con try/catch.
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error(JSON.stringify({
                layer: "Auth",
                action: "CalimacoLoginNonJson",
                message: "Calimaco respondió 2xx pero el body no es JSON",
                metadata: {
                    user: username,
                    statusCode: response.status,
                    contentType: response.headers.get("content-type"),
                    cfRay: response.headers.get("cf-ray"),
                    server: response.headers.get("server"),
                    serverResponseSample: responseText.slice(0, 500)
                }
            }));
            throw new Error("Respuesta inesperada del servicio de login");
        }

        // Check for login error
        if (data.event === "loginError" && data.result === "error") {
            return {
                isError: true,
                errorData: formatLoginError(data, theme)
            };
        }

        if (data.result !== "OK") {
            throw new Error(data.description || "Error en Calimaco Login");
        }

        return {
            isError: false,
            user: data.user,
            // Si el cliente pidió remember_me y Calimaco lo emitió, viene aquí.
            rememberMe: data?.data?.remember_me || null
        };
    } catch (error) {
        console.error("Error calling Calimaco login:", error);
        throw error;
    }
}

function formatLoginError(errorData, theme) {
    const basePath = theme === "apuestas" ? "apuestas-deportivas" : "casino-online";
    const code = errorData.code || -1;

    const errorResponses = {
        1: {
            message: "Usuario y/o contraseña incorrecta, inténtalo de nuevo o ",
            linkText: "restablece tu contraseña",
            linkPath: `/${basePath}/forgotPassword`,
            action: "openWebsite",
            variant: "error"
        },
        2: {
            message: "Para tu seguridad y debido al máximo de intentos fallidos, es necesario ",
            linkText: "restablecer tu contraseña",
            linkPath: `/${basePath}/forgotPassword`,
            action: "openWebsite",
            variant: "warning"
        },
        3: {
            message: "Se restringió el acceso a tu cuenta. Escríbenos por nuestro chat online si necesitas ayuda. ",
            linkText: "Ir a la web",
            linkPath: "/",
            action: "openWebsite",
            variant: "warning"
        },
        "-25": {
            message: "Se restringió el acceso a tu cuenta. Escríbenos por nuestro chat online si necesitas ayuda. ",
            linkText: "Ir a la web",
            linkPath: "/",
            action: "openWebsite",
            variant: "warning"
        },
        "-1": {
            message: "No se ha podido hacer login, intentelo de nuevo más tarde.",
            linkText: null,
            linkPath: null,
            action: null,
            variant: "warning"
        }
    };

    const errorInfo = errorResponses[code] || {
        message: errorData.description || "Error de login",
        linkText: null,
        linkPath: null,
        action: null,
        variant: "error"
    };

    return {
        event: errorData.event,
        result: errorData.result,
        code: code,
        ...errorInfo
    };
}

async function callGetUserDetail(session) {
    try {
        const body = new URLSearchParams({ company: "ACP", session: session });

        console.log("Calling Calimaco getUserDetails API");

        const response = await fetch(`${CALIMACO_BASE_URL}/data/getUserDetails`, {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "access-control-allow-origin": "*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: body.toString()
        });

        // Mismo patrón que callCalimacoLogin: validar HTTP antes de
        // parsear JSON. Acá no tiramos — getUserDetails es complementario,
        // si falla seguimos con datos vacíos.
        if (!response.ok) {
            const errorText = await response.text();
            console.error(JSON.stringify({
                layer: "Auth",
                action: "CalimacoGetUserDetailsHttpError",
                message: "getUserDetails respondió con código HTTP de error (no 2xx)",
                metadata: {
                    statusCode: response.status,
                    statusText: response.statusText,
                    contentType: response.headers.get("content-type"),
                    cfRay: response.headers.get("cf-ray"),
                    server: response.headers.get("server"),
                    serverResponseSample: errorText.slice(0, 500)
                }
            }));
            return { ok: false, status: response.status, data: { message: "Error getting user details" } };
        }

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error(JSON.stringify({
                layer: "Auth",
                action: "CalimacoGetUserDetailsNonJson",
                message: "getUserDetails respondió 2xx pero el body no es JSON",
                metadata: {
                    statusCode: response.status,
                    contentType: response.headers.get("content-type"),
                    cfRay: response.headers.get("cf-ray"),
                    server: response.headers.get("server"),
                    serverResponseSample: responseText.slice(0, 500)
                }
            }));
            return { ok: false, status: response.status, data: { message: "Error getting user details" } };
        }

        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("Error calling getUserDetails:", error);
        return { ok: false, status: 500, data: { message: "Error getting user details" } };
    }
}

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

    console.log("Calling Cognito InitiateAuth");

    const response = await fetch(COGNITO_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("InitiateAuth response:", JSON.stringify(data));

    return { ok: response.ok, status: response.status, data };
}

async function callRespondToAuthChallenge(clientId, username, answer, secretHash, session, clientMetadata) {
    const body = {
        ChallengeName: "CUSTOM_CHALLENGE",
        ClientId: clientId,
        ChallengeResponses: { USERNAME: username, ANSWER: answer, SECRET_HASH: secretHash },
        Session: session
    };

    // ClientMetadata viaja al trigger verify-auth-challenge para que
    // persista refresh_token_col + device_id en Redis. Luego
    // pre-token-generation los inyecta como claims del IdToken.
    if (clientMetadata && Object.keys(clientMetadata).length > 0) {
        body.ClientMetadata = clientMetadata;
    }

    console.log("Calling Cognito RespondToAuthChallenge");

    const response = await fetch(COGNITO_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.RespondToAuthChallenge"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("RespondToAuthChallenge response:", JSON.stringify(data));

    return { ok: response.ok, status: response.status, data };
}

export const lambda_handler = async (event, context) => {
    const origin = event.headers?.origin || event.headers?.Origin;

    console.log("Event received:", JSON.stringify(event));
    console.log("Origin:", origin);

    try {
        // Handle OPTIONS preflight
        if (event.httpMethod === "OPTIONS") {
            console.log("Handling CORS preflight request");
            return createResponse(200, { message: "CORS preflight successful" }, origin);
        }

        // Parse body
        const body = JSON.parse(event.body || "{}");
        const {
            username,
            password,
            theme = "casino",
            remember_me = false,
            device_name
        } = body;

        // Validate required fields
        if (!username?.trim() || !password?.trim()) {
            return createResponse(400, { message: "Completar los campos obligatorios" }, origin);
        }

        const wantsRememberMe = remember_me === true || remember_me === "true";

        console.log(
            "Processing login for user:", username,
            "Theme:", theme,
            "remember_me:", wantsRememberMe
        );

        // ===========================================================
        // STEP 1: Validate credentials with Calimaco (con o sin remember_me)
        // ===========================================================
        console.log("[sign-in] STEP 1/6 — Calimaco login");
        const loginResult = await callCalimacoLogin(
            username,
            password,
            theme,
            wantsRememberMe,
            device_name
        );

        if (loginResult.isError) {
            console.log("[sign-in] Calimaco rechazó las credenciales");
            return createResponse(401, loginResult.errorData, origin);
        }

        const calimacoUser = loginResult.user;
        const sessionToken = calimacoUser.session;

        console.log("[sign-in] STEP 1 OK — Calimaco login successful", {
            alias: calimacoUser.alias,
            user_id: calimacoUser.user,
            session_present: Boolean(sessionToken),
            remember_me_present: Boolean(loginResult.rememberMe),
            remember_me_device_id: loginResult.rememberMe?.device_id || null,
            remember_me_expires_at: loginResult.rememberMe?.expires_at || null,
            remember_me_refresh_token_len: loginResult.rememberMe?.refresh_token?.length || 0
        });

        // ===========================================================
        // STEP 2: Create user in Cognito if doesn't exist
        // ===========================================================
        console.log("[sign-in] STEP 2/6 — Cognito user exists check");
        if (!(await userExists(username))) {
            console.log("[sign-in] User not found, creating in Cognito");
            await createUserInCognito(username, password);
            console.log("[sign-in] STEP 2 OK — User created in Cognito");
        } else {
            console.log("[sign-in] STEP 2 OK — User already exists in Cognito");
        }

        // ===========================================================
        // STEP 3: Generate secret hash
        // ===========================================================
        console.log("[sign-in] STEP 3/6 — Generating secret hash");
        const secretHash = generateSecretHash(username);
        console.log("[sign-in] STEP 3 OK — secret hash generated, len=" + secretHash.length);

        // ===========================================================
        // STEP 4: Cognito InitiateAuth
        // ===========================================================
        console.log("[sign-in] STEP 4/6 — Cognito InitiateAuth");
        const initAuthResult = await callInitAuth(CLIENT_ID, username, secretHash);

        if (!initAuthResult.ok) {
            console.error("[sign-in] STEP 4 FAIL — InitAuth no OK", {
                status: initAuthResult.status,
                data: initAuthResult.data
            });
            throw new Error(`Error in INIT_AUTH: ${JSON.stringify(initAuthResult.data)}`);
        }

        const session = initAuthResult.data.Session;
        console.log("[sign-in] STEP 4 OK — InitAuth Session present:", Boolean(session));

        // ===========================================================
        // STEP 5: Encrypt session + refresh_token + getUserDetails (paralelo)
        // ===========================================================
        const rawRefreshToken = loginResult.rememberMe?.refresh_token || null;
        console.log("[sign-in] STEP 5/6 — Parallel: encrypt(session) + " +
            (rawRefreshToken ? "encrypt(refresh_token)" : "skip refresh") +
            " + getUserDetails");

        let cryptoSessionResult, cryptoRefreshResult, detailResult;
        try {
            [cryptoSessionResult, cryptoRefreshResult, detailResult] = await Promise.all([
                invokeLambda(FN_CRYPTO, { mode: "encrypt", payload: sessionToken }),
                rawRefreshToken
                    ? invokeLambda(FN_CRYPTO, { mode: "encrypt", payload: rawRefreshToken })
                    : Promise.resolve({ body: "" }),
                callGetUserDetail(sessionToken)
            ]);
        } catch (parallelErr) {
            console.error("[sign-in] STEP 5 FAIL — Promise.all rejected", {
                name: parallelErr?.name,
                message: parallelErr?.message,
                stack: parallelErr?.stack
            });
            throw parallelErr;
        }

        const encryptedSession = cryptoSessionResult.body || "";
        const encryptedRefreshToken = cryptoRefreshResult.body || "";
        const deviceId = loginResult.rememberMe?.device_id || "";
        const calimacoDetailData = detailResult.data?.user || {};

        console.log("[sign-in] STEP 5 OK", {
            encryptedSession_len: encryptedSession.length,
            encryptedRefreshToken_len: encryptedRefreshToken.length,
            deviceId_present: Boolean(deviceId),
            getUserDetails_ok: detailResult.ok,
            getUserDetails_status: detailResult.status
        });

        // ===========================================================
        // STEP 6: RespondToAuthChallenge con ClientMetadata
        // El refresh_token (cifrado) y device_id (plano) viajan en
        // ClientMetadata → verify-auth-challenge los guarda en Redis →
        // pre-token-generation los inyecta como claims del IdToken.
        //
        // El cliente NO recibe estos valores en el response — viven
        // SOLO dentro del IdToken. El cliente trata al IdToken como
        // un Bearer opaco.
        // ===========================================================
        const clientMetadata = {};
        if (encryptedRefreshToken) clientMetadata.refresh_token_col = encryptedRefreshToken;
        if (deviceId) clientMetadata.device_id = deviceId;

        console.log("[sign-in] STEP 6/6 — RespondToAuthChallenge", {
            clientMetadata_keys: Object.keys(clientMetadata),
            has_refresh_token_col: Boolean(clientMetadata.refresh_token_col),
            has_device_id: Boolean(clientMetadata.device_id)
        });

        const authResult = await callRespondToAuthChallenge(
            CLIENT_ID,
            username,
            encryptedSession,
            secretHash,
            session,
            clientMetadata
        );

        if (!authResult.ok) {
            console.error("[sign-in] STEP 6 FAIL — RespondToAuthChallenge no OK", {
                status: authResult.status,
                data: authResult.data
            });
            throw new Error(`Error in AUTH: ${JSON.stringify(authResult.data)}`);
        }

        const authData = authResult.data.AuthenticationResult || {};

        console.log("[sign-in] STEP 6 OK — Cognito issued tokens", {
            has_AccessToken: Boolean(authData.AccessToken),
            has_IdToken: Boolean(authData.IdToken),
            has_RefreshToken: Boolean(authData.RefreshToken),
            ExpiresIn: authData.ExpiresIn
        });
        console.log("[sign-in] DONE — Login successful for user:", username);

        // 8. Return tokens and user data.
        //
        // El cliente recibe SOLO los tokens de Cognito + datos de usuario.
        // El refresh_token y device_id de Calimaco viven DENTRO del IdToken
        // como claims (refresh_token_col cifrado, device_id en plano).
        // El cliente trata al IdToken como un Bearer opaco — no lo decodifica.
        //
        // Cuando el IdToken expira, el cliente llama /data/refresh enviando
        // el IdToken expirado como Bearer; el middleware extrae las claims
        // y hace el refresh contra Calimaco.
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
                groups: calimacoDetailData.groups,
                currency: calimacoDetailData.currency,
                birthday: calimacoDetailData.birthday,
                gender: calimacoDetailData.gender,
                national_id_type: calimacoDetailData.national_id_type
            }
        }, origin);

    } catch (error) {
        console.error("[sign-in] UNHANDLED ERROR", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return createResponse(500, { message: "Ocurrió un error inesperado" }, origin);
    }
};
