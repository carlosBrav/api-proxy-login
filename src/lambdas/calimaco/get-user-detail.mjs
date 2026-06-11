import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const FN_CRYPTO = process.env.FN_CRYPTO;
const REGION = process.env.REGION;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

async function invokeCrypto(session) {
    try {
        const command = new InvokeCommand({
            FunctionName: FN_CRYPTO,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify({ mode: "decrypt", payload: session })
        });

        const response = await lambdaClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        return result.body || "";
    } catch (error) {
        console.error("Error invoking crypto lambda:", error);
        return "";
    }
}

function decodeJwtFromEvent(event) {
    try {
        return event.requestContext.authorizer.claims;
    } catch (error) {
        return { error: "No se pudo obtener el token del contexto" };
    }
}

function createResponse(statusCode, data) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
}

export const lambda_handler = async (event) => {
    try {
        const tokenPayload = decodeJwtFromEvent(event);
        if (tokenPayload.error) {
            return createResponse(401, { message: "Sin Autorización" });
        }

        const session = tokenPayload.session_col || "";
        console.log("session:", session);

        const sessionCol = await invokeCrypto(session);
        console.log("sessionCol:", sessionCol);

        const response = await fetch(`${CALIMACO_BASE_URL}/data/getUserDetails`, {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "access-control-allow-origin": "*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: new URLSearchParams({
                company: "ACP",
                session: sessionCol
            })
        });

        const userDetail = await response.json();
        console.log("response.json:", userDetail);

        if (userDetail.code && userDetail.code !== 0) {
            return createResponse(401, { message: "Sin Autorización" });
        }

        // Parse accounts amounts (divide by 100)
        try {
            const accountsList = userDetail.user?.accounts || [];
            
            if (accountsList.length > 0) {
                for (const account of accountsList) {
                    const originalAmount = account.amount;
                    
                    if (typeof originalAmount === "number") {
                        account.amount = Math.round((originalAmount / 100) * 100) / 100; // Round to 2 decimals
                    } else if (originalAmount === null || originalAmount === undefined) {
                        account.amount = 0.0;
                    }
                }
            }
        } catch (parseError) {
            console.error("Error parsing accounts decimals:", parseError);
        }

        return createResponse(200, userDetail);

    } catch (error) {
        console.error("Error en la solicitud:", error);
        return createResponse(500, { message: "Ocurrió un error inesperado" });
    }
};
