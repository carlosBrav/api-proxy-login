const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

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

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const { status, data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/getUsersPersonalPreferences`, {
            "company": "ACP"
        });

        if (data.code == -2) {
            console.error("API getUsersPersonalPreferences:", data);
            return callback(null, createErrorResponse(400, "La sesión ingresada no es válido"));
        }

        return createResponse(200, data);
    } catch (err) {
        console.error("Lambda execution error:", err);
        if (err?.statusCode) {
            return err;
        }

        return createErrorResponse(500, "Ocurrio un error inesperado");
    }
};
