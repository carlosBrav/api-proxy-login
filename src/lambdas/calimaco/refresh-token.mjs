import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.REGION;
const FN_CRYPTO = process.env.FN_CRYPTO;
const COGNITO_URL = process.env.COGNITO_URL;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CALIMACO_BASE_URL = process.env.CALIMACO_BASE_URL;

const lambdaClient = new LambdaClient({ region: REGION });

const invokeLambda = async (functionName, payloadObj) => {
    console.log(`Execute Lambda ${functionName}:`, JSON.stringify(payloadObj, null, 2));

    const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(payloadObj)),
    });

    const response = await lambdaClient.send(command);

    const payload = Buffer.from(response.Payload).toString();

    console.log(`Response Lambda ${functionName}:`, payload);

    return JSON.parse(payload);
};

async function callCalimacoApi(url, body) {
    try {
        console.log(`CALL API CALIMACO ${url}:`, JSON.stringify(body, null, 2));

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body)
        });

        const data = await response.json();

        console.log(`RESPONSE API CALIMACO ${url}:`, JSON.stringify(data, null, 2));

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

async function callCognitoApi(url, body) {
    try {
        console.log(`CALL API COGNITO ${url}:`, JSON.stringify(body, null, 2));

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth" },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log(`RESPONSE API COGNITO ${url}:`, JSON.stringify(data, null, 2));

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

    if (!parsedBody.refreshToken) {
        return { isValid: false };
    }

    return { isValid: true, payload: parsedBody };
}

export const lambda_handler = async (event, context, callback) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        const { isValid, payload } = validBody(event.body);
        if (!isValid) {
            return createErrorResponse(400, "Completar los campos obligatorios");
        }

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;
        const username = claims["cognito:username"];

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        //1. Validate Session
        var { data: { code: codeCalimacoResult } } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/validateSession`, {
            "company": "ACP",
            "session": calimacoSession
        });

        if (codeCalimacoResult == -2)
            return createErrorResponse(401, "Sin Autorización");

        //2. Cognito API
        const secretHash = await invokeLambda("lambda-col-securizacion-tokenizacion-generate-hash",
            {
                body: JSON.stringify({
                    "username": username
                })
            }
        );

        const { status, data } = await callCognitoApi(COGNITO_URL, {
            "AuthFlow": "REFRESH_TOKEN_AUTH",
            "ClientId": COGNITO_CLIENT_ID,
            "AuthParameters": {
                "SECRET_HASH": secretHash.body,
                "REFRESH_TOKEN": payload.refreshToken
            }
        });

        if (status != 200)
            return createErrorResponse(400, "El refresh token no es válido");

        return createResponse(200, {
            "idToken": data.AuthenticationResult.IdToken
        });
    } catch (err) {
        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrio un error inesperado");
    }
};
