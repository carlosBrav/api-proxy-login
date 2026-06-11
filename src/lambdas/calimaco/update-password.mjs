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
            "Access-Control-Allow-Methods": "OPTIONS,PATCH",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
}

export const lambda_handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");
        const { old_password, new_password } = body;

        if (!old_password?.trim() || !new_password?.trim()) {
            return createResponse(400, { message: "Completar los campos obligatorios" });
        }

        const tokenPayload = decodeJwtFromEvent(event);
        if (tokenPayload.error) {
            return createResponse(401, { message: "Sin Autorización" });
        }

        const session = tokenPayload.session_col || "";
        console.log("Session extraída:", session);

        const calimacoSession = await invokeCrypto(session);
        
        if (!calimacoSession) {
            console.warn("calimacoSession vacío. Posible token expirado o inválido.");
            return createResponse(401, { message: "Sesión inválida o expirada." });
        }

        const response = await fetch(`${CALIMACO_BASE_URL}/data/updatePassword`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                company: "ACP",
                session: calimacoSession,
                old_password,
                new_password
            })
        });

        let apiData = {};
        try {
            apiData = await response.json();
        } catch (error) {
            apiData = { message: `Error al decodificar la respuesta de la API externa (Status: ${response.status})` };
        }

        // Si la API devuelve 200 pero el cuerpo indica error de negocio
        if (response.ok && apiData.result === "error") {
            console.error(`Error de negocio detectado (Code: ${apiData.code}):`, apiData);
            return createResponse(400, apiData);
        }

        return createResponse(response.status, apiData);

    } catch (error) {
        console.error("Error en la solicitud:", error);
        return createResponse(500, { message: "Ocurrió un error inesperado" });
    }
};
