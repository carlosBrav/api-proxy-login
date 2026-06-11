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
        console.log(`[obtain] [invokeCrypto] → ${FN_CRYPTO}`, {
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
            console.error(`[obtain] [invokeCrypto] FunctionError`, {
                FunctionError: response.FunctionError,
                payload: result,
                durationMs: Date.now() - t0
            });
        } else {
            console.log(`[obtain] [invokeCrypto] OK`, {
                durationMs: Date.now() - t0,
                body_len: typeof result?.body === "string" ? result.body.length : null
            });
        }

        return result.body || "";
    } catch (error) {
        console.error("[obtain] [invokeCrypto] threw", {
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
 * Lista las super-sesiones (tokens persistentes) activas del usuario.
 *
 * Endpoint Calimaco: POST {CALIMACO_BASE_URL}/auth/tokens
 * (CALIMACO_BASE_URL ya incluye /api al final; ver sign-in.mjs que usa /auth/login)
 * Body: company, session
 *
 * Devuelve array con id, device_id, device_name, created_at, last_used_at,
 * expires_at, revoked_at, ips, user_agent, rotation_counter, status.
 *
 * Útil para una pantalla "Mis dispositivos" en perfil.
 */
async function callCalimacoListTokens(calimacoSession) {
    try {
        const body = new URLSearchParams({
            company: "ACP",
            session: calimacoSession
        });

        console.log("Calling Calimaco listUserTokens API");

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/tokens`, {
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

        console.log("Calimaco listUserTokens response:", response.status, JSON.stringify(data));

        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("Error calling Calimaco listUserTokens:", error);
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

        // STEP 1: Sacar la session encriptada del JWT
        console.log("[obtain] STEP 1/3 — Extract claims from authorizer");
        const claims = decodeJwtFromEvent(event);
        if (claims.error) {
            console.warn("[obtain] STEP 1 FAIL — Claims missing", claims);
            return createResponse(401, { message: "Sin Autorización" }, origin);
        }

        const encryptedSession = claims.session_col || "";
        if (!encryptedSession) {
            console.warn("[obtain] STEP 1 FAIL — session_col claim ausente", {
                claim_keys: Object.keys(claims)
            });
            return createResponse(400, { message: "No se encontró la sesión en el token" }, origin);
        }
        console.log("[obtain] STEP 1 OK — session_col len=" + encryptedSession.length);

        // STEP 2: Descifrar la session con FN_CRYPTO
        console.log("[obtain] STEP 2/3 — Decrypt session via FN_CRYPTO");
        const calimacoSession = await invokeCrypto(encryptedSession);
        if (!calimacoSession) {
            console.error("[obtain] STEP 2 FAIL — invokeCrypto returned empty");
            return createResponse(500, { message: "Error desencriptando la sesión" }, origin);
        }
        console.log("[obtain] STEP 2 OK — calimaco session decrypted");

        // STEP 3: Llamar a Calimaco
        console.log("[obtain] STEP 3/3 — Calimaco /api/auth/tokens");
        const result = await callCalimacoListTokens(calimacoSession);

        if (!result.ok || result.data?.result !== "OK") {
            console.warn("[obtain] STEP 3 FAIL — Calimaco no OK", {
                status: result.status,
                code: result.data?.code,
                description: result.data?.description
            });
            return createResponse(result.status || 500, {
                message: result.data?.description || "Error obteniendo lista de tokens",
                code: result.data?.code
            }, origin);
        }

        const tokens = result.data.data || [];
        console.log("[obtain] DONE — tokens count=" + tokens.length);
        return createResponse(200, { tokens }, origin);

    } catch (error) {
        console.error("[obtain] UNHANDLED ERROR", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return createResponse(500, { message: "Ocurrió un error inesperado" }, origin);
    }
};
