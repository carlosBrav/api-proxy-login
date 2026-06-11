import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

// ==========================================
// CLIENTE LAMBDA (Igual a tu base)
// ==========================================
const invokeLambda = async (functionName, payloadObj) => {
    const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(payloadObj)),
    });

    const response = await lambdaClient.send(command);
    const payload = Buffer.from(response.Payload).toString();
    return JSON.parse(payload);
};

// ==========================================
// NUEVA FUNCIÓN: Obtener URL Final (Opener)
// ==========================================
async function getFinalRedirectUrl(baseUrl, queryParams) {
    try {
        // Construimos la URL con los parámetros
        const queryString = new URLSearchParams(queryParams).toString();
        const fullUrl = `${baseUrl}?${queryString}`;
        
        console.log("Iniciando flujo de redirección desde:", fullUrl);

        // Hacemos el fetch. Por defecto 'redirect: follow' sigue los 302.
        const response = await fetch(fullUrl, {
            method: "GET",
            redirect: "follow" 
        });

        // Verificamos si la respuesta final fue exitosa (200 OK)
        if (!response.ok) {
            console.error(`Error en la petición: Status ${response.status}`);
            return {
                success: false,
                status: response.status
            };
        }

        // LA CLAVE: response.url contiene la URL final después de todas las redirecciones
        const finalUrl = response.url;
        console.log("URL Final detectada:", finalUrl);

        return {
            success: true,
            status: response.status,
            finalUrl: finalUrl
        };

    } catch (err) {
        console.error("Error siguiendo redirecciones:", err);
        return {
            success: false,
            status: 500
        };
    }
}

// ==========================================
// HELPERS (Iguales a tu base)
// ==========================================

function createErrorResponse(statusCode = 500, message = "Error") {
    return createResponse(statusCode, { message });
}

export function createResponse(statusCode = 200, data = {}) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        body: JSON.stringify(data),
    };
}

function getClaims(event) {
    return event?.requestContext?.authorizer?.claims || {};
}

function validateHeaders(event) {
    const authHeader = event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
        throw createErrorResponse(401, "Sin Autorización");
}

// Validación ajustada para los datos del juego
function validBody(payload) {
    if (!payload) return { isValid: false };

    let parsedBody;
    try {
        parsedBody = JSON.parse(payload);
    } catch {
        return { isValid: false };
    }

    // Validamos que vengan los datos necesarios para el opener
    if (!parsedBody.machine || !parsedBody.external_id || !parsedBody.type) {
        return { isValid: false };
    }

    return { isValid: true, payload: parsedBody };
}

function isValidString(value, name) {
    if (typeof value !== "string" && typeof value !== "number") // Aceptamos number por si el ID es numérico
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    return value;
}

// ==========================================
// HANDLER PRINCIPAL
// ==========================================
export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        // 1. Validaciones iniciales
        validateHeaders(event);

        const { isValid, payload } = validBody(event.body);
        if (!isValid)
            return createErrorResponse(400, "Faltan campos obligatorios: machine, external_id, type");

        // 2. Extraer variables del body
        const extenal_session = isValidString(payload.extenal_session, "extenal_session");
        const machine = isValidString(payload.machine, "machine");
        const external_id = isValidString(payload.external_id, "external_id");
        const type = isValidString(payload.type, "type");
        const company = payload.company || "ACP"; // Default a ACP si no viene

        // 3. Desencriptar sesión (reutilizando tu lógica)
        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        if (!calimacoSession) {
            return createErrorResponse(401, "No se pudo obtener una sesión válida.");
        }

        // 4. Llamar al Opener y obtener la URL final
        // URL base del opener
        const openerBaseUrl = `${CALIMACO_BASE_URL}/casino/opener`;
        
        // Parámetros para el opener
        const openerParams = {
            session: extenal_session,
            company: company,
            machine: machine,
            external_id: external_id,
            type: type,
            demo: "false",
            lang: "es" // Forzamos español o lo recibimos del payload
        };

        const result = await getFinalRedirectUrl(openerBaseUrl, openerParams);
        console.log("result", result)
        if (!result.success) {
            // Manejo de errores similar a tu ejemplo
            if (result.status === 401 || result.status === 403) {
                return callback(null, createErrorResponse(401, "La sesión ha expirado o no es válida."));
            }
            return callback(null, createErrorResponse(502, "Error al conectar con el proveedor de juegos."));
        }

        // 5. Parsear la URL final para extraer Token y WebSocket
        // result.finalUrl es: https://client.pragmaticplaylive.net/...?token=XYZ&socket_server=wss...
        
        const parsedUrl = new URL(result.finalUrl);
        const params = Object.fromEntries(parsedUrl.searchParams.entries());

        // Construimos la respuesta limpia que necesitas
        const responseData = {
            connection: {
                socket_server: params.socket_server,
                socket_port: params.socket_port,
                token: params.token,
                casino_id: params.casino_id,
                user_id: params.userId,
                jsessionid: params.JSESSIONID
            },
            metadata: {
                table_type: params.tabletype,
                game_mode: params.game_mode,
                lang: params.lang,
                web_server: params.web_server
            },
            // Opcional: devolvemos la URL completa del lobby por si el front la necesita para un iframe
            lobby_url: result.finalUrl 
        };

        return createResponse(200, responseData);

    } catch (err) {
        if (err?.statusCode) {
            return err;
        }
        
        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrio un error inesperado durante el proceso de conexión.");
    }
};