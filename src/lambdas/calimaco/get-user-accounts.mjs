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

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const authHeader = event.headers?.Authorization;
        if (!authHeader) {
            return createErrorResponse(400, "El token es obligatorio");
        }

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const { status, data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/getUserAccounts`, {
            "company": "ACP",
            "session": calimacoSession
        });

        if (data.code == -2) {
            console.error("API getUserAccounts:", status);
            return createErrorResponse(401, "Sin Autorización");
        }
        
        // --- INICIO: Lógica para el formato de decimales ---
        const accounts_list = data?.user?.accounts;
        
        if (accounts_list && Array.isArray(accounts_list)) {
            accounts_list.forEach(account => {
                let original_amount = account.amount;
                
                // La API de Calimaco ya devuelve el 'amount' con decimales.
                // Tu lógica original en Python (original_amount / 100.0) sugiere
                // que el valor de la API estaba *multiplicado* por 100 (por ejemplo, 9918 en lugar de 99.18).
                //
                // Basado en el ejemplo de respuesta que has dado (amount: 99.18),
                // la conversión / 100 NO sería necesaria si el valor ya viene como 99.18.
                // 
                // **ASUMIMOS que la lógica de conversión / 100 es NECESARIA** // para estandarizar el formato, como lo indica tu código Python.
                
                let new_amount_float;
                
                if (typeof original_amount === 'number' && !isNaN(original_amount)) {
                    // Aplicar la conversión / 100.0 (equivalente a la lógica Python)
                    new_amount_float = original_amount / 100.0; 
                    
                    // Redondear a 2 decimales
                    account.amount = parseFloat(new_amount_float.toFixed(2));
                } else if (original_amount === null || original_amount === undefined) {
                    account.amount = 0.0;
                }
                // Si el 'amount' es un string, podrías necesitar una conversión adicional, 
                // pero asumimos que es un número o null basado en el ejemplo y el código original.
            });
        }
        // --- FIN: Lógica para el formato de decimales ---

        return createResponse(200, data);
    } catch (err) {
        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrio un error inesperado");
    }
};
