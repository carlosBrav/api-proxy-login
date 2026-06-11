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
            body: new URLSearchParams(body),
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
            "Access-Control-Allow-Methods": "OPTIONS,GET",
        },
        body: JSON.stringify(data),
    };
}

function isValidDateTime(text) {
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!regex.test(text)) return false;

    const [datePart, timePart] = text.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    const date = new Date(year, month - 1, day, hour, minute, second);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day &&
        date.getHours() === hour &&
        date.getMinutes() === minute &&
        date.getSeconds() === second
    );
}

function validateNumberParam(param, name) {
    if (param === undefined)
        throw createErrorResponse(400, `El parámetro '${name}' debe ser un número mayor a 0`);

    const num = Number(param);
    if (Number.isNaN(num) || num < 0) {
        throw createErrorResponse(400, `El parámetro '${name}' debe ser un número mayor a 0`);
    }

    if (!Number.isInteger(num)) {
        throw createErrorResponse(400, `El parámetro '${name}' debe ser un número entero`);
    }

    return num;
}

function validateDateParam(param, name) {
    if (!param) return null;
    if (!isValidDateTime(param)) {
        throw createErrorResponse(400, `El parámetro '${name}' debe ser una fecha válida`);
    }
    return param;
}

function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) return false;

    const start = new Date(startDate.replace(" ", "T"));
    const end = new Date(endDate.replace(" ", "T"));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return false;
    }

    return end.getTime() >= start.getTime();
}

function validateHeaders(event) {
    const authHeader = event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
        throw createErrorResponse(401, "Sin Autorización");
}

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const queryParams = event.queryStringParameters || {};

        const init = validateNumberParam(queryParams.init, "init");
        const end = validateNumberParam(queryParams.end, "end");
        const op_date_init = validateDateParam(queryParams.op_date_init, "op_date_init");
        const op_date_end = validateDateParam(queryParams.op_date_end, "op_date_end");

        if (init >= end)
            throw createErrorResponse(400, `El parámetro 'init' no debe ser mayor a 'end'`);

        if (!validateDateRange(op_date_init, op_date_end))
            throw createErrorResponse(400, `El parámetro 'op_date_init' no debe ser mayor a 'op_date_end'`);

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(
            FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession,
            }
        );

        const { status, data } = await callCalimacoApi(
            `${CALIMACO_BASE_URL}/data/getOperationsHistory`,
            {
                company: "ACP",
                session: calimacoSession,
                limits: JSON.stringify({ init, end }),
                filter: JSON.stringify({ op_date_init, op_date_end }),
            }
        );

        return createResponse(200, data);
    } catch (err) {
        if (err?.statusCode) {
            return err;
        }
        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrió un error inesperado");
    }
};
