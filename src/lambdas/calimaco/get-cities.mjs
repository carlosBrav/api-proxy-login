
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

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

function validateNumberParam(param, name) {
    if (param === undefined || param === null || param === "") {
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    }

    if (typeof param !== "string") {
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    }

    const isNumeric = /^[0-9]+$/.test(param);

    if (!isNumeric) {
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);
    }

    return param.trim();
}

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const queryParams = event.queryStringParameters || {};

        const state = validateNumberParam(queryParams.state, "state");
        const province = validateNumberParam(queryParams.province, "province");

        const { data } = await callCalimacoApi(
            `${CALIMACO_BASE_URL}/contents/getCities`,
            {
                country: "PE",
                state: state,
                province: province
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
