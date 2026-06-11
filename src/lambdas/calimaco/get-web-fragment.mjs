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

function getClaims(token) {
    if (!token || token.split('.').length !== 3) {
        throw { statusCode: 401, message: "Sin Autorización" };
    }

    const [, payloadB64] = token.split('.');

    const payloadJson = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    return payloadJson;
}

function hasAuthHeader(event) {
    const authHeader = event.headers?.Authorization;
    return authHeader && authHeader.startsWith("Bearer ");
}

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const queryParams = event.queryStringParameters || {};
        const fragment = queryParams.fragment;

        if (!fragment) {
            return createErrorResponse(400, "El parámetro 'fragment' es obligatorio");
        }

        const requestBody = {
            "company": "ACP",
            "fragment": fragment
        };

        if (hasAuthHeader(event)) {
            const claims = getClaims(event.headers.Authorization);
            const encryptedSession = claims.session_col;

            if (encryptedSession) {
                const { body: calimacoSession } = await invokeLambda(FN_CRYPTO, {
                    mode: "decrypt",
                    payload: encryptedSession,
                });

                requestBody.session = calimacoSession;
            }
        }

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/contents/getWebFragment`, requestBody);

        if(data.result == "error"){
            console.error("API getWebFragment:", data);

            if (data.code == -2) {
                return callback(null, createErrorResponse(401, "Sin Autorización"));
            }

            if (data.code == -26) {
                return callback(null, createErrorResponse(400, "No cuenta con privilegios"));
            }

            return callback(null, createErrorResponse(400, "El 'fragment' ingresado no es válido"));
        }

        return createResponse(200, data);
    } catch (err) {
        console.error("Handler Exception:", err);
        const statusCode = err.statusCode || 500;
        const message = err.message || "Error interno del servidor";
        return createResponse(statusCode, { message });
    }
};
