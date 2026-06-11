import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Campos obligatorios mínimos (paginación)
const REQUIRED_FIELDS = ["init", "end"];

const lambdaClient = new LambdaClient({ region: REGION });

// ==================================================================
// 2. HELPERS DEL SISTEMA
// ==================================================================
const secureLog = (label, data) => {
    // 🟢 [SEGURIDAD]: Ocultamos session y datos sensibles
    const SENSITIVE_KEYS = ["aws-token", "authorization", "session", "session_col"];
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

// 🟢 [COMPATIBILIDAD]: Form-UrlEncoded (Vital para que el backend entienda el JSON stringificado)
const callExternalApi = async (url, bodyObj, userAgent) => {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded", 
                "User-Agent": userAgent 
            },
            body: new URLSearchParams(bodyObj)
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

// Helper local para validar fechas solo si existen
const isValidDateTime = (text) => {
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!text || !regex.test(text)) return false;
    const [datePart, timePart] = text.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    const date = new Date(year, month - 1, day, hour, minute, second);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const validateRequest = (event) => {
    const headers = {};
    if (event.headers) {
        Object.keys(event.headers).forEach(key => headers[key.toLowerCase()] = event.headers[key]);
    }

    let token = headers["aws-token"];
    if (!token && headers["authorization"]) {
        const auth = headers["authorization"];
        if (auth.startsWith("bearer ")) token = auth.substring(7);
        else token = auth;
    }

    if (!token) throw { statusCode: 401, message: "Unauthorized: Token faltante." };

    // C. Validar Query Parameters (GET)
    const params = event.queryStringParameters || {};
    
    // Validación mínima de paginación
    const missing = REQUIRED_FIELDS.filter(field => !params[field] && params[field] !== '0');
    if (missing.length > 0) throw { statusCode: 400, message: `Faltan parámetros obligatorios: ${missing.join(", ")}` };

    return { token, params, headers };
};

const validateDataTypes = (params) => {
    const errors = [];

    // 1. Validar Paginación (init, end)
    const init = Number(params.init);
    const end = Number(params.end);

    if (Number.isNaN(init) || init < 0 || !Number.isInteger(init)) 
        errors.push("'init' debe ser un entero positivo");
    if (Number.isNaN(end) || end < 0 || !Number.isInteger(end)) 
        errors.push("'end' debe ser un entero positivo");
    
    if (init >= end) 
        errors.push("'init' no debe ser mayor o igual a 'end'");

    // 2. Construir Objeto Filter Dinámico
    const filter = {};

    // Validar Fechas (Opcionales)
    if (params.op_date_init) {
        const dateInitStr = params.op_date_init.replace(/%20/g, " ");
        if (!isValidDateTime(dateInitStr)) errors.push("'op_date_init' formato inválido");
        filter.op_date_init = dateInitStr;
    }

    if (params.op_date_end) {
        const dateEndStr = params.op_date_end.replace(/%20/g, " ");
        if (!isValidDateTime(dateEndStr)) errors.push("'op_date_end' formato inválido");
        filter.op_date_end = dateEndStr;
    }

    // Validar Rango si ambas fechas existen
    if (filter.op_date_init && filter.op_date_end) {
        const dStart = new Date(filter.op_date_init.replace(" ", "T"));
        const dEnd = new Date(filter.op_date_end.replace(" ", "T"));
        if (dEnd.getTime() < dStart.getTime()) {
            errors.push("'op_date_init' no puede ser mayor que 'op_date_end'");
        }
    }

    // 🟢 [CORRECCIÓN]: Agregar Type y Status al filtro si vienen
    if (params.type) filter.type = String(params.type).trim(); // Ej: DEPOSIT
    if (params.status) filter.status = String(params.status).trim(); // Ej: SUCCESS

    if (errors.length > 0) throw { statusCode: 400, message: errors.join(". ") };
    
    return { 
        init, 
        end, 
        filterObject: filter // Retornamos el objeto listo para stringify
    };
};

// ==================================================================
// 4. HANDLER PRINCIPAL
// ==================================================================
export const lambda_handler = async (event) => {
    secureLog("Evento Recibido", event);

    try {
        // PASO 1: Validar Entrada
        const { token, params, headers } = validateRequest(event);
        const { init, end, filterObject } = validateDataTypes(params);
        const userAgent = getUserAgent(headers);

        // PASO 2: Gestión de Sesión
        const sessionToDecrypt = extractSessionFromJwt(token) || token;
        
        secureLog("Proceso", { step: "Desencriptando token" });
        const session = await getDecryptedSession(sessionToDecrypt);

        if (!session) {
            throw { statusCode: 401, message: "Unauthorized: Sesión inválida o expirada." };
        }

        // PASO 3: Preparar Body (Replicando CURL exacto)
        // La API espera:
        // company=ACP
        // session=...
        // limits={"init":0,"end":1}  <-- JSON String
        // filter={"type":"DEPOSIT",...} <-- JSON String
        
        const externalApiBody = {
            company: "ACP",
            session: session,
            limits: JSON.stringify({ init, end }), // Serializamos limits
            filter: JSON.stringify(filterObject)   // Serializamos filter dinámico
        };

        // PASO 4: Llamar API
        secureLog("Proceso", { step: "Llamando API Externa", url: `${CALIMACO_BASE_URL}/data/getTransactionsHistory` });
        const apiResponse = await callExternalApi(`${CALIMACO_BASE_URL}/data/getTransactionsHistory`, externalApiBody, userAgent);

        // PASO 5: Manejo de Errores de Negocio
        // Caso: Sesión expirada (-2)
        if (Number(apiResponse.code) === -2) {
            return createResponse(401, { message: "Sin Autorización (Sesión caducada)", errorCode: -2 });
        }

        // Caso: Error genérico
        if (apiResponse.result === "error") {
            const code = apiResponse.code || 400;
            const msg = apiResponse.description || apiResponse.message || "Error al obtener historial";
            return createResponse(400, { message: msg, errorCode: code });
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