import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const REQUIRED_FIELDS = ["days", "comments"]; 

const lambdaClient = new LambdaClient({ region: REGION });

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos comentarios por privacidad
    const SENSITIVE_KEYS = ["aws-token", "authorization", "session", "session_col", "comments", "comentario"];
    const replacer = (key, value) => SENSITIVE_KEYS.includes(key) ? "*****REDACTED*****" : value;
    console.log(`[${label}]`, JSON.stringify(data, replacer, 2));
};

const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,aws-token,Aws-Token,Authorization,authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(body),
});

// 🟢 [MAESTRO V4]: Extraer User-Agent real
const getUserAgent = (headers) => {
    return headers["user-agent"] || "AcityClient/1.0";
};

// 🟢 [MAESTRO V4]: Extraer session_col del JWT
const extractSessionFromJwt = (token) => {
    try {
        if (!token.includes('.')) return null; 
        const parts = token.split('.');
        if (parts.length !== 3) return null;
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
    if (response.FunctionError) {
        console.error("Critical: Crypto Lambda Failed", response.FunctionError);
        throw { statusCode: 500, message: "Error interno de seguridad." };
    }

    const payloadJson = JSON.parse(Buffer.from(response.Payload).toString());
    return payloadJson.body; 
};

// 🟢 [MAESTRO V4]: Pasamos userAgent dinámico
const callExternalApi = async (url, body, userAgent) => {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "User-Agent": userAgent 
            },
            body: JSON.stringify(body)
        });
        
        const text = await response.text();
        try { return JSON.parse(text); } catch { return { raw: text, status: response.status }; }
    } catch (err) {
        console.error("External API Network Error:", err);
        throw { statusCode: 502, message: "Error de comunicación con el proveedor externo." };
    }
};

// ==================================================================
// 3. LÓGICA DE VALIDACIÓN (ROBUSTA)
// ==================================================================
const validateRequest = (event) => {
    // A. Normalizar Headers
    const headers = {};
    if (event.headers) {
        Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);
    }

    // B. Buscar Token
    let token = headers["aws-token"];
    if (!token && headers["authorization"]) {
        const auth = headers["authorization"];
        if (auth.startsWith("bearer ")) token = auth.substring(7);
        else token = auth;
    }

    if (!token) throw { statusCode: 401, message: "Unauthorized: Token faltante." };

    // C. Validar Body
    if (!event.body) throw { statusCode: 400, message: "Bad Request: Body vacío." };
    let payload;
    try {
        payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
        throw { statusCode: 400, message: "Bad Request: JSON inválido." };
    }

    // D. Validar Campos Requeridos
    const missing = REQUIRED_FIELDS.filter(field => !payload[field] && payload[field] !== 0);
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan campos obligatorios: ${missing.join(", ")}` };

    return { token, payload, headers };
};

const validateDataTypes = (payload) => {
    const errors = [];

    // Validar Días (Entero entre 1 y 366)
    const days = Number(payload.days);
    if (!Number.isInteger(days) || days <= 0 || days > 366) {
        errors.push("'days' debe ser un número entero entre 1 y 366");
    }

    // Validar Comentario (String no vacío)
    const comments = String(payload.comments).trim();
    if (comments.length === 0) {
        errors.push("'comments' es requerido");
    }

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    
    return { days, comments };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { token, payload, headers } = validateRequest(event);
        const { days, comments } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers);

        // PASO 2: Gestión de Sesión
        const sessionToDecrypt = extractSessionFromJwt(token) || token;
        
        secureLog("Proceso", { step: "Desencriptando token" });
        const session = await getDecryptedSession(sessionToDecrypt);

        if (!session) {
            throw { statusCode: 401, message: "Unauthorized: Sesión inválida o expirada." };
        }

        // PASO 3: Preparar Body
        const externalApiBody = {
            company: "ACP",
            session: session,
            days: days,
            comments: comments
        };

        // PASO 4: Llamar API
        secureLog("Proceso", { step: "Llamando API Externa", url: CALIMACO_BASE_URL });
        const apiResponse = await callExternalApi(`${CALIMACO_BASE_URL}/data/autoexclude`, externalApiBody, userAgent);

        // PASO 5: Manejo de Errores de Negocio
        if (apiResponse.code && apiResponse.code !== 0) {
            const errorCodigo = Number(apiResponse.code);

            // Caso: Sesión expirada (-2)
            if (errorCodigo === -2) {
                return createResponse(401, { message: "Sin Autorización (Sesión caducada)", errorCode: -2 });
            }

            // Caso: Datos incompletos (-15)
            if (errorCodigo === -15) {
                return createResponse(400, { message: "Completar los campos obligatorios", errorCode: -15 });
            }

            // Otros errores
            return createResponse(400, { 
                message: apiResponse.description || apiResponse.message || "Error en autoexclusión",
                errorCode: errorCodigo 
            });
        }

        // Caso: Error genérico sin código numérico (legacy logic)
        if (apiResponse.result === "error") {
            // Nota: El legacy devolvía 500 aquí. Estandarizamos a 400 o 500 según prefieras.
            // Por seguridad, un error de negocio debería ser 400, pero si prefieres 500:
            console.error("API Generic Error:", apiResponse);
            return createResponse(500, { message: "Ocurrió un error inesperado al procesar la solicitud." });
        }

        // Éxito
        return createResponse(200, apiResponse);

    } catch (err) {
        console.error("Handler Exception:", err);
        const statusCode = err.statusCode || 500;
        const message = err.message || "Error interno del servidor";
        return createResponse(statusCode, { message });
    }
};