// ==================================================================
// 1. CONFIGURACIÓN
// ==================================================================
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const EXTERNAL_API_URL = `${CALIMACO_BASE_URL}/auth/mobileAvailable`;
const REQUIRED_FIELDS = ["mobile"];

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos teléfonos
    const SENSITIVE_KEYS = ["mobile", "phone", "celular", "numeroTelefono", "password", "aws-token"];
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

// 🟢 [COMPATIBILIDAD]: Form-UrlEncoded (Requisito Legacy)
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
    const headers = {};
    if (event.headers) {
        Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);
    }

    // Nota: Endpoint público, sin validación de Token.

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
    
    // Limpieza
    const mobile = String(payload.mobile).trim();

    // 🟢 [SEGURIDAD]: Fail Fast (Validación de longitud antes de Regex)
    // El formato +51... suele tener entre 9 y 15 caracteres. Ponemos márgenes seguros.
    if (mobile.length < 8 || mobile.length > 20) {
        errors.push("El parámetro 'mobile' tiene una longitud inválida");
    } else {
        // Regex Legacy Estricto (Debe tener el '+' al inicio)
        const regex = /^\+(\d{1,4})\d{7,15}$/;
        if (!regex.test(mobile)) {
            errors.push("El parámetro 'mobile' no es válido (formato requerido: +51...)");
        }
    }

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    return { mobile };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { payload, headers } = validateRequest(event);
        const { mobile } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers);

        // PASO 2: Construir Body
        const externalApiBody = {
            company: "ACP",
            mobile: mobile
        };

        // PASO 3: Llamar API (Con User-Agent Passthrough)
        secureLog("Proceso", { step: "Llamando API Externa", url: EXTERNAL_API_URL });
        const apiResponse = await callExternalApi(EXTERNAL_API_URL, externalApiBody, userAgent);

        // PASO 4: Manejo de Errores de Negocio
        if (apiResponse.result === "error") {
            console.warn(`API Error: ${apiResponse.result}`);
            return createResponse(400, { 
                message: "El 'móvil' ingresado no es válido",
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