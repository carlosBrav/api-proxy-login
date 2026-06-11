import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// No requiere campos en el body (solo el token en header)
const REQUIRED_FIELDS = []; 

const lambdaClient = new LambdaClient({ region: REGION });

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos datos de sesión y preferencias sensibles
    const SENSITIVE_KEYS = ["aws-token", "authorization", "session", "session_col", "preferences", "email", "sms"];
    const replacer = (key, value) => SENSITIVE_KEYS.includes(key) ? "*****REDACTED*****" : value;
    console.log(`[${label}]`, JSON.stringify(data, replacer, 2));
};

const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,aws-token,Aws-Token,Authorization,authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
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

// 🟢 [MAESTRO V4]: Pasamos userAgent dinámico y usamos JSON
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

    // C. Validar Body (Opcional)
    let payload = {};
    if (event.body) {
        try {
            payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch {
            console.warn("Body no es JSON válido (Ignorado)");
        }
    }

    // D. Validar Campos Requeridos (Vacío en este caso)
    const missing = REQUIRED_FIELDS.filter(field => !payload[field]);
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan campos obligatorios: ${missing.join(", ")}` };

    return { token, payload, headers };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { token, headers } = validateRequest(event);
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
            session: session
        };

        // PASO 4: Llamar API
        secureLog("Proceso", { step: "Llamando API Externa", url: `${CALIMACO_BASE_URL}/data/getUserPersonalPreferences` });
        const apiResponse = await callExternalApi(`${CALIMACO_BASE_URL}/data/getUserPersonalPreferences`, externalApiBody, userAgent);

        // PASO 5: Manejo de Errores de Negocio
        
        // Caso: Sesión expirada (-2)
        if (Number(apiResponse.code) === -2) {
            console.warn("API Code -2: Sesión Expirada");
            return createResponse(401, { 
                message: "La sesión ingresada no es válida o ha expirado",
                errorCode: -2
            });
        }

        // Caso: Otros errores
        if (apiResponse.code && apiResponse.code !== 0) {
             console.warn(`API Error Code ${apiResponse.code}`);
             return createResponse(400, {
                 message: apiResponse.message || apiResponse.description || "Error obteniendo preferencias",
                 errorCode: apiResponse.code
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