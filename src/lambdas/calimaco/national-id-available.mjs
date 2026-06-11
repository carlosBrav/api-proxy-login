// ==================================================================
// 1. CONFIGURACIÓN
// ==================================================================
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const EXTERNAL_API_URL = `${CALIMACO_BASE_URL}/auth/nationalIDAvailable`;
const REQUIRED_FIELDS = ["document"];

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos cualquier tipo de documento
    const SENSITIVE_KEYS = ["document", "nationalID", "dni", "passport", "ce", "password", "aws-token"];
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

    // Limpieza básica
    const document = String(payload.document).trim().toUpperCase(); // Pasaportes suelen ser mayúsculas

    // 🟢 [MEJORA]: Validación Flexible (DNI / C.E. / Pasaporte)

    // 1. Longitud segura (Cubre DNI de 8, C.E. de 9-12, Pasaportes de 6-15)
    if (document.length < 6 || document.length > 15) {
        errors.push("El documento debe tener entre 6 y 15 caracteres");
    }
    // 2. Caracteres permitidos (Alfanumérico, sin símbolos raros)
    else if (!/^[A-Z0-9]+$/.test(document)) {
        errors.push("El documento contiene caracteres inválidos (solo letras y números)");
    }
    // 3. Regla Anti-Fraude específica para DNI (Solo aplica si son 8 números)
    else if (/^[0-9]{8}$/.test(document)) {
        const isRepeated = /^(\d)\1{7}$/.test(document); // Ej: 11111111
        if (isRepeated) {
            errors.push("DNI inválido (dígitos repetidos)");
        }
    }

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    return { document };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { payload, headers } = validateRequest(event);
        const { document } = validateDataTypes(payload);
        const userAgent = getUserAgent(headers);

        // PASO 2: Construir Body
        const externalApiBody = {
            company: "ACP",
            nationalID: document
        };

        // PASO 3: Llamar API
        secureLog("Proceso", { step: "Llamando API Externa", url: EXTERNAL_API_URL });
        const apiResponse = await callExternalApi(EXTERNAL_API_URL, externalApiBody, userAgent);

        // PASO 4: Manejo de Errores de Negocio
        if (apiResponse.result === "error") {
            console.warn(`API Error: ${apiResponse.result}`);
            return createResponse(400, {
                message: "El 'documento' ingresado no es válido o ya está registrado",
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