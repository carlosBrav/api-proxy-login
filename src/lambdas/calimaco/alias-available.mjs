// ==================================================================
// 1. CONFIGURACIÓN
// ==================================================================
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const EXTERNAL_API_URL = `${CALIMACO_BASE_URL}/auth/aliasAvailable`;
const REQUIRED_FIELDS = ["alias"];

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos el alias/usuario
    const SENSITIVE_KEYS = ["alias", "username", "user", "password", "aws-token"];
    const replacer = (key, value) => SENSITIVE_KEYS.includes(key) ? "*****REDACTED*****" : value;
    console.log(`[${label}]`, JSON.stringify(data, replacer, 2));
};

const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,aws-token,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(body),
});

// 🟢 [MAESTRO V4]: Extraer User-Agent real
const getUserAgent = (headers) => {
    return headers["user-agent"] || "AcityClient/1.0";
};

// 🟢 [COMPATIBILIDAD]: Usamos Form-UrlEncoded por requisito del Legacy
const callExternalApi = async (url, bodyObj, userAgent) => {
    try {
        const formData = new URLSearchParams(bodyObj);

        const response = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded", 
                "User-Agent": userAgent 
            },
            body: formData
        });

        const text = await response.text();
        try { return JSON.parse(text); } catch { return { raw: text, status: response.status }; }
    } catch (err) {
        console.error("External API Network Error:", err);
        throw { statusCode: 502, message: "Error de comunicación con el proveedor externo." };
    }
};

// ==================================================================
// 3. LÓGICA DE VALIDACIÓN
// ==================================================================
const validateRequest = (event) => {
    // A. Normalizar Headers
    const headers = {};
    if (event.headers) {
        Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);
    }

    // Nota: Es endpoint público, no validamos Token.

    // B. Validar Body
    if (!event.body) throw { statusCode: 400, message: "Bad Request: Body vacío." };
    let payload;
    try {
        payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
        throw { statusCode: 400, message: "Bad Request: JSON inválido." };
    }

    // C. Campos Requeridos
    const missing = REQUIRED_FIELDS.filter(field => !payload[field]);
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan campos obligatorios: ${missing.join(", ")}` };

    return { payload, headers };
};

const validateDataTypes = (payload) => {
    const errors = [];
    
    const alias = String(payload.alias).trim();

    // 🟢 [MEJORA SEGURIDAD]: Validación de longitud (Fail Fast)
    // Evita ataques con strings de 1MB
    if (alias.length < 3 || alias.length > 50) {
        errors.push("El parámetro 'alias' debe tener entre 3 y 50 caracteres");
    }

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    return { alias };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { payload, headers } = validateRequest(event);
        const { alias } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers);

        // PASO 2: Construir Body
        const externalApiBody = {
            company: "ACP",
            alias: alias
        };

        // PASO 3: Llamar API (Con User-Agent Passthrough)
        secureLog("Proceso", { step: "Llamando API Externa", url: EXTERNAL_API_URL });
        const apiResponse = await callExternalApi(EXTERNAL_API_URL, externalApiBody, userAgent);

        // PASO 4: Manejo de Errores de Negocio
        if (apiResponse.result === "error") {
            console.warn(`API Error: ${apiResponse.result}`);
            return createResponse(400, { 
                message: "El 'alias' ingresado no es válido o ya existe",
                details: apiResponse 
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