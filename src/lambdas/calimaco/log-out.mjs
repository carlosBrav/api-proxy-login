import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const FN_CRYPTO = process.env.FN_CRYPTO;
const REGION = process.env.REGION;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

async function invokeCrypto(session) {
    const t0 = Date.now();
    try {
        console.log("[log-out] [invokeCrypto] →", FN_CRYPTO, { mode: "decrypt", payloadLen: session?.length || 0 });
        const command = new InvokeCommand({
            FunctionName: FN_CRYPTO,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify({ mode: "decrypt", payload: session })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));

        if (response.FunctionError) {
            console.error("[log-out] [invokeCrypto] FunctionError", {
                FunctionError: response.FunctionError,
                payload: result,
                durationMs: Date.now() - t0
            });
        } else {
            console.log("[log-out] [invokeCrypto] OK", {
                durationMs: Date.now() - t0,
                statusCode: result?.statusCode,
                body_len: typeof result?.body === "string" ? result.body.length : null
            });
        }

        return result.body || "";
    } catch (error) {
        console.error("[log-out] [invokeCrypto] threw", {
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

function parseBody(event) {
    try {
        return JSON.parse(event.body || "{}");
    } catch {
        return {};
    }
}

function createResponse(statusCode, data) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
}

/**
 * Si el cliente tenía super-sesión activa (remember_me), revoca el
 * refresh_token en Calimaco antes del logout. Best-effort: si la revoke
 * falla no bloqueamos el logout — siempre hay que cerrar la sesión normal.
 */
async function revokeRememberMeToken(calimacoSession, deviceId) {
    if (!deviceId) {
        console.log("[log-out] revoke skipped — no device_id");
        return { skipped: true };
    }

    try {
        const body = new URLSearchParams({
            company: "ACP",
            session: calimacoSession,
            device_id: deviceId
        });

        console.log("[log-out] Calling Calimaco /auth/tokens/revoke for device:", deviceId);

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/tokens/revoke`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });

        // Leemos el body UNA SOLA VEZ como text para evitar "Body is unusable".
        const rawBody = await response.text();
        let data;
        try {
            data = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            data = rawBody;
        }

        console.log("[log-out] Revoke response:", response.status, JSON.stringify(data));
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("[log-out] Error revocando refresh_token:", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return { ok: false, error: error.message };
    }
}

async function callCalimacoLogout(calimacoSession) {
    try {
        console.log("[log-out] Calling Calimaco /auth/logout");

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                company: "ACP",
                session: calimacoSession
            })
        });

        // Leemos el body UNA SOLA VEZ como text para evitar "Body is unusable".
        const rawBody = await response.text();
        let data;
        try {
            data = rawBody ? JSON.parse(rawBody) : null;
        } catch {
            data = rawBody;
        }

        console.log("[log-out] Logout response:", response.status, JSON.stringify(data));
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error("[log-out] Error en Calimaco logout:", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return { ok: false, status: 500, data: { message: "Error en logout", error: error.message } };
    }
}

export const lambda_handler = async (event) => {
    console.log("[log-out] Event received");

    try {
        // ===========================================================
        // STEP 1: Extraer claims del JWT (Cognito Authorizer)
        // ===========================================================
        console.log("[log-out] STEP 1/4 — Extract claims from authorizer");
        const tokenPayload = decodeJwtFromEvent(event);
        if (tokenPayload.error) {
            console.warn("[log-out] STEP 1 FAIL — Claims missing", tokenPayload);
            return createResponse(401, { message: "Sin Autorización" });
        }

        const session = tokenPayload.session_col || "";
        if (!session) {
            console.warn("[log-out] STEP 1 FAIL — session_col claim ausente", {
                claim_keys: Object.keys(tokenPayload)
            });
            return createResponse(400, { message: "No se encontró la sesión en el token" });
        }
        console.log("[log-out] STEP 1 OK — session_col len=" + session.length);

        // ===========================================================
        // STEP 2: Resolver device_id (body > claim > none)
        // ===========================================================
        console.log("[log-out] STEP 2/4 — Resolve device_id");
        const bodyParsed = parseBody(event);
        const deviceIdFromBody = bodyParsed?.device_id;
        const deviceIdFromClaim = tokenPayload.device_id;
        const deviceId = (deviceIdFromBody && String(deviceIdFromBody).trim()) || deviceIdFromClaim;

        console.log("[log-out] STEP 2 OK", {
            device_id: deviceId || "(ninguno)",
            source: deviceIdFromBody ? "body" : (deviceIdFromClaim ? "claim" : "absent")
        });

        // ===========================================================
        // STEP 3: Descifrar session con FN_CRYPTO
        // ===========================================================
        console.log("[log-out] STEP 3/4 — Decrypt session via FN_CRYPTO");
        const calimacoSession = await invokeCrypto(session);
        if (!calimacoSession) {
            console.error("[log-out] STEP 3 FAIL — could not decrypt session");
            return createResponse(500, { message: "Error desencriptando la sesión" });
        }
        console.log("[log-out] STEP 3 OK — calimaco session decrypted");

        // ===========================================================
        // STEP 4: Llamadas paralelas — revoke (si aplica) + logout
        // ===========================================================
        console.log("[log-out] STEP 4/4 — Parallel revoke + logout");
        const [revokeResult, logoutResult] = await Promise.all([
            revokeRememberMeToken(calimacoSession, deviceId),
            callCalimacoLogout(calimacoSession)
        ]);

        console.log("[log-out] DONE", {
            logout_status: logoutResult.status,
            revoke_skipped: Boolean(revokeResult?.skipped),
            revoke_ok: revokeResult?.skipped ? null : Boolean(revokeResult?.ok)
        });

        const logoutData = logoutResult.data;
        return createResponse(logoutResult.status, {
            ...(typeof logoutData === "object" && logoutData !== null ? logoutData : { body: logoutData }),
            remember_me_revoked: revokeResult?.skipped ? null : Boolean(revokeResult?.ok)
        });

    } catch (error) {
        console.error("[log-out] UNHANDLED ERROR", {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
        return createResponse(500, { message: "Ocurrió un error inesperado" });
    }
};
