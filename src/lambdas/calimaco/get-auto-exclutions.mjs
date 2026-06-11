import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const PATH_TYC = process.env.PATH_TYC;

const lambdaClient = new LambdaClient({ region: REGION });


// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================

const secureLog = (label, data) => {
    const SENSITIVE_KEYS = ["aws-token", "authorization", "session", "session_col", "code", "password"];
    const replacer = (key, value) => SENSITIVE_KEYS.includes(key) ? "*****REDACTED*****" : value;
    console.log(`[${label}]`, JSON.stringify(data, replacer, 2));
};

const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,aws-token,Aws-Token,Authorization,authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    },
    body: JSON.stringify(body),
});

const getUserAgent = (headers) => {
    return headers["user-agent"] || "AcityClient/1.0";
};

const extractSessionFromJwt = (token) => {
    try {
        if (!token || !token.includes('.')) return null;
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload.session_col || null;
    } catch {
        return null;
    }
};

const getDecryptedSession = async (token) => {
    const command = new InvokeCommand({
        FunctionName: FN_CRYPTO,
        Payload: Buffer.from(JSON.stringify({ mode: "decrypt", payload: token })),
    });
    const response = await lambdaClient.send(command);
    if (response.FunctionError) throw { statusCode: 500, message: "Error interno de seguridad." };
    const payloadJson = JSON.parse(Buffer.from(response.Payload).toString());
    return payloadJson.body || payloadJson; 
};

const callExternalApiForm = async (url, bodyObj, userAgent) => {
    try {
        const params = new URLSearchParams();
        Object.keys(bodyObj).forEach(key => params.append(key, bodyObj[key]));
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": userAgent },
            body: params
        });
        const text = await response.text();
        try { return JSON.parse(text); } catch { return { raw: text, status: response.status }; }
    } catch (err) {
        console.error("External API Network Error:", err);
        throw { statusCode: 502, message: "Error de comunicación con el proveedor externo." };
    }
};

// ==================================================================
// 3. LÓGICA DE VALIDACIÓN Y NEGOCIO
// ==================================================================

const validateRequest = (event) => {
    const headers = {};
    if (event.headers) Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);

    let token = headers["aws-token"];
    if (!token && headers["authorization"]) {
        const auth = headers["authorization"];
        token = auth.startsWith("Bearer ") || auth.startsWith("bearer ") ? auth.substring(7) : auth;
    }
    if (!token) throw { statusCode: 401, message: "Unauthorized: Token faltante." };

    return { token, headers };
};

/** * 🟢 [NUEVO HELPER]: Saneamiento de fechas y estados
 * Revisa si la autoexclusión ya venció comparando con la hora de Lima
 */
const sanitizeAutoExclusions = (data) => {
    // Si no hay array de autoexclusiones, retornamos la data tal cual
    if (!data || !Array.isArray(data.autoexclusions)) return data;

    const now = new Date(); // Fecha actual del servidor (UTC)
    
    // Iteramos y modificamos in-place
    data.autoexclusions.forEach(item => {
        if (item.end_date && item.status === "ACTIVE") {
            try {
                // 1. Convertimos formato SQL "2025-09-18 20:46:29" a ISO compatible
                // 2. Le agregamos "-05:00" para decirle a JS que esa fecha es HORA PERÚ
                const isoDateString = item.end_date.replace(" ", "T") + "-05:00";
                
                const endDate = new Date(isoDateString);

                // Si la fecha actual (now) es MAYOR que la fecha de fin, venció.
                if (now > endDate) {
                    console.log(`[INFO] Corrigiendo status para usuario ${item.user}: Venció ${item.end_date}`);
                    item.status = "INACTIVE";
                }
            } catch (e) {
                console.warn("Error parseando fecha:", item.end_date);
            }
        }
    });

    return data;
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================

export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        const { token, headers } = validateRequest(event);
        const userAgent = getUserAgent(headers);
        const sessionToDecrypt = extractSessionFromJwt(token) || token;
        
        const session = await getDecryptedSession(sessionToDecrypt);
        if (!session) throw { statusCode: 401, message: "Unauthorized: Sesión inválida." };

        const externalApiBody = { ccompany: "ACP", session: session };

        secureLog("Proceso", { step: "Llamando API Externa" });
        let apiResponse = await callExternalApiForm(`${CALIMACO_BASE_URL}/data/getUserAutoexclusions`, externalApiBody, userAgent);

        // Manejo de errores
        if (apiResponse.result === "error" || (apiResponse.code && apiResponse.code !== 0)) {
            const code = Number(apiResponse.code);
            if (code === -2) return createResponse(401, { message: "Sesión expirada.", errorCode: -2 });
            return createResponse(400, { message: apiResponse.description || "Error", errorCode: code });
        }

        // 🟢 [NUEVO]: Aplicar corrección de fechas antes de responder
        apiResponse = sanitizeAutoExclusions(apiResponse);

        apiResponse.redirectUrl = PATH_TYC;
        return createResponse(200, apiResponse);

    } catch (err) {
        console.error("Handler Exception:", err);
        const statusCode = err.statusCode || 500;
        const message = err.message || "Error interno del servidor";
        return createResponse(statusCode, { message });
    }
};