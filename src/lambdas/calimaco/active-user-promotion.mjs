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

    const payloadStr = new TextDecoder().decode(response.Payload);
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

function validateCodePromotion(code) {
    const num = Number(code);
    if (!code || Number.isNaN(num) || num < 0) {
        throw createErrorResponse(400, "El código ingresado no es válido");
    }
    return num;
}

function dictionaryError(apiName, data) {
    console.error(`API ${apiName}: `, JSON.stringify(data));

    if (data.code) {
        switch (data.code) {
            case -2:
                throw createErrorResponse(400, "El código ingresado no es válido");
            case -15:
                throw createErrorResponse(400, "Completar todos los campos");
            default:
                break;
        }
    }

    switch (data.description) {
        case 'Another promotion already activated':
            throw createErrorResponse(400, "La promoción ya esta activada");
        case 'Promotion not found':
            throw createErrorResponse(400, "El código ingresado no es válido");
        default:
            throw createErrorResponse(500, "Ocurrió un error inesperado");
    }
}

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const { isValid, payload } = validBody(event.body);
        if (!isValid) {
            return createErrorResponse(400, "Completar los campos obligatorios");
        }

        validateCodePromotion(payload.code);

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/activateUserPromotion`, {
            "company": "ACP",
            "session": calimacoSession,
            "promotion": payload.code
        });

        if (data?.result === "error") {
            dictionaryError("activateUserPromotion", data);
        }

        return createResponse(200, data);
    } catch (err) {
        if (err?.statusCode) return err;

        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrió un error inesperado");
    }
};
