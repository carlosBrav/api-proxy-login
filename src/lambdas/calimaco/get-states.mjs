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
            'Cache-Control': 'public, max-age=3600'
        },
        body: JSON.stringify(data),
    };
}

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const { data } = await callCalimacoApi(
            `${CALIMACO_BASE_URL}/contents/getStates`,
            {
                country: "PE"
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
