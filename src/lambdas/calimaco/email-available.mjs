// 🟢 [OPTIMIZACIÓN]: Eliminamos @aws-sdk/client-lambda porque este endpoint es PÚBLICO

// ==================================================================
// 1. CONFIGURACIÓN
// ==================================================================
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const EXTERNAL_API_URL = `${CALIMACO_BASE_URL}/auth/emailAvailable`;
const REQUIRED_FIELDS = ["email"];

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // Ocultamos el email (PII)
    const SENSITIVE_KEYS = ["email", "password", "aws-token", "authorization"];
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

const getUserAgent = (headers) => {
    return headers["user-agent"] || "AcityClient/1.0";
};

// 🟢 [COMPATIBILIDAD]: Volvemos a x-www-form-urlencoded porque el Legacy lo usaba.
// Las APIs de Auth antiguas suelen preferir esto sobre JSON.
const callExternalApi = async (url, bodyObj, userAgent) => {
    try {
        // Convertimos el objeto a URLSearchParams
        const formData = new URLSearchParams(bodyObj);

        const response = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded", // Formato Legacy
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
    const headers = {};
    if (event.headers) {
        Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);
    }

    // Nota: Sin validación de Token (Público)

    if (!event.body) throw { statusCode: 400, message: "Bad Request: Body vacío." };
    let payload;
    try {
        payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
        throw { statusCode: 400, message: "Bad Request: JSON inválido." };
    }

    const missing = REQUIRED_FIELDS.filter(field => !payload[field]);
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan campos obligatorios: ${missing.join(", ")}` };

    return { payload, headers };
};

const validateDataTypes = (payload) => {
    const errors = [];
    
    const email = String(payload.email).trim();
    
    // 🟢 [SEGURIDAD]: Límite de longitud para evitar ataques ReDoS con Regex
    if (email.length > 254) {
        errors.push("'email' es demasiado largo");
    } else {
        // Regex Estricto (Legacy)
        const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.)+[A-Za-z]{2,}$/;
        if (email.length === 0 || !re.test(email)) {
            errors.push("'email' no es válido");
        }
    }

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    return { email };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { payload, headers } = validateRequest(event);
        const { email } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers);

        // PASO 2: Construir Body
        const externalApiBody = {
            company: "ACP",
            email: email
        };

        // PASO 3: Llamar API (Form-UrlEncoded + User-Agent)
        secureLog("Proceso", { step: "Llamando API Externa", url: EXTERNAL_API_URL });
        const apiResponse = await callExternalApi(EXTERNAL_API_URL, externalApiBody, userAgent);

        // PASO 4: Manejo de Errores de Negocio
        if (apiResponse.result === "error") {
            console.warn(`API Error: ${apiResponse.result}`);
            return createResponse(400, { 
                message: "El 'email' ingresado no es válido",
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