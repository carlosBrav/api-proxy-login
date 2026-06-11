const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

function isValidEmail(email) {
    const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return pattern.test(email);
}

function createResponse(statusCode, data) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
}

export const lambda_handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");
        const email = body.email || "";

        if (!email) {
            return createResponse(400, { message: "Completar los campos obligatorios" });
        }

        if (!isValidEmail(email)) {
            return createResponse(400, { message: "El email ingresado no tiene un formato válido" });
        }

        const response = await fetch(`${CALIMACO_BASE_URL}/auth/forgotPassword`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                company: "ACP",
                email
            }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        const data = await response.json();
        return createResponse(response.status, data);

    } catch (error) {
        console.error("Error:", error);

        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return createResponse(504, { message: "Timeout - No response from server" });
        }

        if (error instanceof SyntaxError) {
            return createResponse(400, { message: "Completar los campos obligatorios" });
        }

        return createResponse(500, { message: "Ocurrió un error inesperado" });
    }
};
