import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

let origin = "*";

const invokeLambda = async (functionName, payloadObj) => {
    const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(payloadObj)),
    });

    const response = await lambdaClient.send(command);

    const payload = Buffer.from(response.Payload).toString();
    return JSON.parse(payload);
};

async function callCalimacoApi(url, body) {
    try {
        console.log(body)
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body)
        });

        const data = await response.json();

        return {
            status: response.status,
            data,
        };
    } catch (err) {
        console.error("Error calling external API:", err);
        return {
            status: 500,
            data: { message: "Error en la comunicación externa" },
        };
    }
}

function getClaims(event) {
    return event?.requestContext?.authorizer?.claims || {};
}

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

function validateHeaders(event) {
    const authHeader = event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
        throw createErrorResponse(401, "Sin Autorización");
}

function validBody(payload) {
    if (!payload) {
        return { isValid: false };
    }

    let parsedBody;
    try {
        parsedBody = JSON.parse(payload);

        if (parsedBody.method == undefined || parsedBody.amount == undefined)
            return { isValid: false };

    } catch {
        return { isValid: false };
    }

    return { isValid: true, payload: parsedBody };
}

function isValidString(value, name) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    }

    const cleaned = value.trim();

    const validRegex = /^[A-Za-z0-9_]+$/;

    if (!validRegex.test(cleaned)) {
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    }

    return cleaned;
}

function validateNumberParam(param, name) {
    if (param === undefined) return null;
    const num = Number(param);
    if (Number.isNaN(num) || num < 0) {
        throw createErrorResponse(400, `El parámetro '${name}' debe ser un número mayor a 0`);
    }
    return num;
}

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        origin = event.headers?.origin || event.headers?.Origin;
        validateHeaders(event);

        const { isValid, payload } = validBody(event.body);
        if (!isValid)
            return createErrorResponse(400, "Completar los campos obligatorios");

        const method = isValidString(payload.method, "method");
        const amount = validateNumberParam(payload.amount, "amount");

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/payment/deposit`, {
            "company": "ACP",
            "session": calimacoSession,
            "method": method,
            "amount": amount,
            "site": undefined
        });

        if (data.result == "error") {
            console.error("API deposit:", data);

            switch (data.code) {
                case -2:
                    return callback(null, createErrorResponse(400, "Método de pago inválido"));
                case -15:
                    return callback(null, createErrorResponse(400, "Completar los campos obligatorios"));
                case -22:
                    return callback(null, createErrorResponse(400, "Límite diario excedido"));
                case -26:
                    return callback(null, createErrorResponse(400, "No cuenta con privilegios"));
                case -49:
                    return callback(null, createErrorResponse(400, "El monto de la transacción no es válido"));
                case -56:
                    return callback(null, createErrorResponse(400, "El método de depósito no está habilitado"));
                default:
                    return callback(null, createErrorResponse(500, "Ocurrio un error inesperado"));
            }
        }

        if (
            origin
            && data?.data?.redirectionURL
            && data.data.redirectionURL.includes("https://www.casinoatlanticcity.com")
        ) {
            let origenApi = new URL(data.data.redirectionURL);
            data.data.redirectionURL = data.data.redirectionURL.replace(origenApi.origin, origin);
        }

        return createResponse(200, data);
    } catch (err) {
        if (err?.statusCode) {
            return err;
        }

        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrio un error inesperado");
    }
};
