import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

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
            "Access-Control-Allow-Methods": "OPTIONS,GET",
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

function isValidString(value, name) {
    if (typeof value !== "string" || value.trim().length <= 0)
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);

    return value.trim();
}

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const queryParams = event.queryStringParameters || {};
        if (!queryParams)
            return createErrorResponse(400, "Completar los campos obligatorios");

        const provider = isValidString(queryParams.provider, "provider");
        const name = isValidString(queryParams.name, "name");

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/contents/getMachineByName`, {
            "company": "ACP",
            "session": calimacoSession,
            "provider": provider,
            "name": name
        });

        if (data.code == -2) {
            console.error("API getMachineByName:", data);
            return callback(null, createErrorResponse(400, "La sesión ingresada no es válido"));
        }

        if (data.code == -15) {
            console.error("API getMachineByName:", data);
            return callback(null, createErrorResponse(400, "Completar los campos obligatorios"));
        }

        if (data.code == -10) {
            console.error("API getMachineByName:", data);
            return callback(null, createErrorResponse(404, "La máquina no existe"));
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
