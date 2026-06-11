import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Environment Variables
const REGION = process.env.REGION || process.env.AWS_REGION || "us-west-2";
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

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

async function invokeCrypto(encryptedSession) {
    const t0 = Date.now();
    try {
        console.log(`[revoke] [invokeCrypto] → ${FN_CRYPTO}`, {
            mode: "decrypt",
            payloadLen: encryptedSession?.length || 0
        });
        const command = new InvokeCommand({
            FunctionName: FN_CRYPTO,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify({ mode: "decrypt", payload: encryptedSession })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));

        if (response.FunctionError) {
            console.error(`[revoke] [invokeCrypto] FunctionError`, {
                FunctionError: response.FunctionError,
                payload: result,
                durationMs: Date.now() - t0
            });
        } else {
            console.log(`[revoke] [invokeCrypto] OK`, {
                durationMs: Date.now() - t0,
                body_len: typeof result?.body === "string" ? result.body.length : null
            });
        }

        return result.body || "";
    } catch (error) {
        console.error("[revoke] [invokeCrypto] threw", {
            name: error?.name,
            message: error?.message,
            durationMs: Date.now() - t0,
            stack: error?.stack
        });
        return "";
    }
}

function decodeJwtFromEvent(event) {
    try {
        return event.requestContext.authorizer.claims;
    } catch (error) {
        return { error: "No se pudo obtener el token del contexto" };
    }
}

/**
 * Revoca una super-sesión específica del usuario por device_id.
 *
 * Endpoint Calimaco: POST {CALIMACO_BASE_URL}/auth/tokens/revoke
 * (CALIMACO_BASE_URL ya incluye /api al final; ver sign-in.mjs que usa /auth/login)
 * Body: company, session, device_id
 *
 * Tras revocar, ese refresh_token deja de ser válido en backend (status:
 * REVOKED). Sirve para "cerrar sesión en otro dispositivo" desde la UI de
 * Mis Dispositivos. Si el usuario revoca su propio device_id, también debe
 * borrar el refresh_token de su almacenamiento local.
 */
async function callCalimacoRevokeToken(calimacoSession, deviceId) {
    try {
        const body = new URLSearchParams({
            company: "ACP",
            session: calimacoSession,
            device_id: deviceId
        });

        console.log("Calling Calimaco revokeUserToken API for device:", deviceId);

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/tokens/revoke`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });

        // Leemos el body UNA SOLA VEZ como text. response.json() consume el body
        // y si falla, response.text() lanza "Body is unusable".
        const rawBody = await response.text();
        let data;
        try {
            data = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            data = rawBody;
        }

        console.log("Calimaco revokeUserToken response:", response.status, JSON.stringify(data));

        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("Error calling Calimaco revokeUserToken:", error);
        throw error;
    }
}

export const lambda_handler = async (event, context, callback) => {
    const origin = event.headers?.origin || event.headers?.Origin;

    console.log("Event received:", JSON.stringify(event));
    console.log("Origin:", origin);

    try {
        // Handle OPTIONS preflight
        if (event.httpMethod === "OPTIONS") {
            return createResponse(200, { message: "CORS preflight successful" }, origin);
        }

        // STEP 1: Extraer claims del JWT (vía Cognito Authorizer)
        console.log("[revoke] STEP 1/4 — Extract claims from authorizer");
        const claims = decodeJwtFromEvent(event);
        if (claims.error) {
            console.warn("[revoke] STEP 1 FAIL — Claims missing", claims);
            return createResponse(401, { message: "Sin Autorización" }, origin);
        }

        const encryptedSession = claims.session_col || "";
        if (!encryptedSession) {
            console.warn("[revoke] STEP 1 FAIL — session_col claim ausente", {
                claim_keys: Object.keys(claims)
            });
            return createResponse(400, { message: "No se encontró la sesión en el token" }, origin);
        }
        console.log("[revoke] STEP 1 OK — session_col len=" + encryptedSession.length);

        // STEP 2: Determinar el device_id a revocar.
        // Si el cliente NO manda body o el body no trae device_id,
        // revocamos el del propio usuario (extraído del claim device_id).
        // Si el cliente manda device_id en body, usa ese (para revocar OTRO
        // dispositivo distinto al actual).
        console.log("[revoke] STEP 2/4 — Resolve device_id");
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch {
                console.warn("[revoke] STEP 2 — body present but not valid JSON, treating as empty");
            }
        }
        const deviceIdFromBody = body?.device_id;
        const deviceIdFromClaim = claims.device_id;
        const deviceId = (deviceIdFromBody && deviceIdFromBody.trim()) || deviceIdFromClaim;

        if (!deviceId) {
            console.warn("[revoke] STEP 2 FAIL — no device_id in body nor in JWT claim", {
                claim_keys: Object.keys(claims)
            });
            return createResponse(400, {
                message: "device_id es requerido (en body o en el IdToken como claim)"
            }, origin);
        }
        console.log("[revoke] STEP 2 OK", {
            device_id: deviceId,
            source: deviceIdFromBody ? "body" : "claim"
        });

        // STEP 3: Descifrar la session con FN_CRYPTO
        console.log("[revoke] STEP 3/4 — Decrypt session via FN_CRYPTO");
        const calimacoSession = await invokeCrypto(encryptedSession);
        if (!calimacoSession) {
            console.error("[revoke] STEP 3 FAIL — invokeCrypto returned empty");
            return createResponse(500, { message: "Error desencriptando la sesión" }, origin);
        }
        console.log("[revoke] STEP 3 OK — calimaco session decrypted");

        // STEP 4: Revocar en Calimaco
        console.log("[revoke] STEP 4/4 — Calimaco /api/auth/tokens/revoke");
        const result = await callCalimacoRevokeToken(calimacoSession, deviceId);

        if (!result.ok || result.data?.result !== "OK") {
            console.warn("[revoke] STEP 4 FAIL — Calimaco no OK", {
                status: result.status,
                code: result.data?.code,
                description: result.data?.description
            });
            return createResponse(result.status || 500, {
                message: result.data?.description || "Error revocando token",
                code: result.data?.code
            }, origin);
        }

        const total = result.data?.data?.total ?? 1;
        console.log("[revoke] DONE — revoked OK", { device_id: deviceId, total });
        return createResponse(200, {
            revoked: true,
            device_id: deviceId,
            total
        }, origin);

    } catch (error) {
        console.error("[revoke] UNHANDLED ERROR", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return createResponse(500, { message: "Ocurrió un error inesperado" }, origin);
    }
};
