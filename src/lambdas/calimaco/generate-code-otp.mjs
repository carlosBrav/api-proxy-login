import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// ==================================================================
// 1. CONFIGURACIÓN
// ==================================================================
const REGION = process.env.AWS_REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL;

// Campos requeridos para Generar OTP
const REQUIRED_FIELDS = ["jugadorIdAlira", "codigoPais", "numeroTelefono"]; 

const lambdaClient = new LambdaClient({ region: REGION });

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    const SENSITIVE_KEYS = ["aws-token", "authorization", "session", "session_col", "sessionIdAlira", "numeroTelefono", "email"];
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
                "User-Agent": userAgent // Identidad real o genérica de negocio
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data;
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
    const missing = REQUIRED_FIELDS.filter(field => !payload[field]);
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan campos obligatorios: ${missing.join(", ")}` };

    return { token, payload, headers };
};

const validateDataTypes = (payload) => {
    const errors = [];

    const playerId = Number(payload.jugadorIdAlira);
    if (isNaN(playerId) || playerId <= 0) errors.push("'jugadorIdAlira' debe ser un número positivo");

    const countryCode = String(payload.codigoPais).trim();
    if (countryCode.length === 0 || !/^\d+$/.test(countryCode)) errors.push("'codigoPais' debe contener solo números");

    const cellPhone = String(payload.numeroTelefono).trim();
    if (!/^(?:\+|00)?\d{6,15}$/.test(cellPhone)) errors.push("'numeroTelefono' no es válido");

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    
    return { playerId, countryCode, cellPhone };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada (incluyendo headers para UA)
        const { token, payload, headers } = validateRequest(event);
        const { playerId, countryCode, cellPhone } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers); // 🟢 V4

        // PASO 2: Gestión de Sesión (JWT o Raw)
        const sessionToDecrypt = extractSessionFromJwt(token) || token;

        // PASO 3: Desencriptar
        secureLog("Proceso", { step: "Desencriptando token" });
        const session = await getDecryptedSession(sessionToDecrypt);

        if (!session) {
            throw { statusCode: 401, message: "Unauthorized: Sesión inválida o expirada." };
        }

        // PASO 4: Preparar Body
        const externalApiBody = {
            jugadorIdAlira: playerId,
            sessionIdAlira: session,
            codigoPais: countryCode,
            numeroTelefono: cellPhone,
            clienteApp: "Calimaco"
        };

        // PASO 5: Llamar API (Con User-Agent Passthrough)
        secureLog("Proceso", { step: "Llamando API Externa", url: EXTERNAL_API_URL });
        const apiResponse = await callExternalApi(EXTERNAL_API_URL, externalApiBody, userAgent);

        // PASO 6: Manejo de Errores de Negocio
        if (apiResponse.errorCodigo && apiResponse.errorCodigo != 0) {
            const errorCodigo = apiResponse.errorCodigo;
            
            // Caso: Sesión expirada (-2) -> 401
            if (Number(errorCodigo) === -2) {
                return createResponse(401, { 
                    message: "La sesión ha expirado, por favor inicie sesión nuevamente.",
                    errorCode: -2
                });
            }
            
            // Caso: Otros errores -> 400
            console.warn(`API Error Code ${errorCodigo}: ${apiResponse.errorMensaje}`);
            return createResponse(400, { 
                message: apiResponse.errorMensaje || "Error de negocio",
                errorCode: errorCodigo
            });
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