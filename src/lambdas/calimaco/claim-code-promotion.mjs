import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

async function invokeLambda(functionName, payloadObj) {
    const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(payloadObj)),
    });

    const response = await lambdaClient.send(command);

    const payloadStr = Buffer.from(response.Payload).toString();
    return JSON.parse(payloadStr);
}

async function callCalimacoApi(url, body) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body),
        });

        const data = await response.json();

        return { status: response.status, data };
    } catch (err) {
        console.error("Error calling external API:", err);
        return {
            status: 500,
            data: { message: "Error en la comunicación externa" },
        };
    }
}

function getClaims(event) {
    return event?.requestContext?.authorizer?.claims ?? {};
}

function createResponse(statusCode = 200, data = {}) {
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

function createErrorResponse(statusCode = 500, message = "Error") {
    return createResponse(statusCode, { message });
}

function validateHeaders(event) {
    const authHeader = event.headers?.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        throw createErrorResponse(401, "Sin Autorización");
    }
}

function validBody(payload) {
    if (!payload) {
        return { isValid: false };
    }

    let parsedBody;
    try {
        parsedBody = JSON.parse(payload);
    } catch {
        return { isValid: false };
    }

    return { isValid: true, payload: parsedBody };
}

function isValidString(value, name) {
    if (typeof value !== "string" || value.trim().length <= 0)
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);

    return value;
}

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const { isValid, payload } = validBody(event.body);
        if (!isValid) {
            return createErrorResponse(400, "Completar los campos obligatorios");
        }

        const code = isValidString(payload.code, "código");

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const { status, data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/claimCodePromotion`, {
            "company": "ACP",
            "session": calimacoSession,
            "code": code
        });
        
        if (data.code == -2) {
            console.error("API claimCodePromotion: ", JSON.stringify(data));
            return callback(null, createErrorResponse(401, "Sin Autorización"));
        }

        if (data.code == -58) {
            console.error("API claimCodePromotion: ", JSON.stringify(data));
            return callback(null, createErrorResponse(400, "El código ya ha sido reclamado"));
        }

        if (data?.result === "error") {
            console.error("API claimCodePromotion:", status);
            return createErrorResponse(400, "El código ingresado no es válido");
        }

        return createResponse(200, data);
    } catch (err) {
        if (err?.statusCode) return err;

        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrió un error inesperado");
    }
};
