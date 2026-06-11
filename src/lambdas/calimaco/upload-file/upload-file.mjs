import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import Busboy from "busboy";
import FormData from "form-data";

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

async function callCalimacoApi(url, formData) {
    try {
        console.log("formData", formData);
        const response = await fetch(url, {
            method: "POST",
            headers: {
                ...formData.getHeaders(),
                "accept": "application/json, text/plain, */*"
            },
            body: formData
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
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        body: JSON.stringify(data),
    };
}

function validateHeaders(event) {
    const authHeader = event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
        throw createErrorResponse(401, "Sin Autorización");
}

const parseMultipartForm = (event) =>
    new Promise((resolve, reject) => {
        const contentType = event.headers["content-type"] || event.headers["Content-Type"];

        if (!contentType) {
            return reject(new Error("Missing Content-Type header"));
        }

        const busboy = Busboy({
            headers: { "content-type": contentType }
        });

        const fields = {};
        const files = [];

        busboy.on("file", (fieldname, fileStream, filename, encoding, mimetype) => {
            const chunks = [];

            fileStream.on("data", chunk => chunks.push(chunk));

            fileStream.on("end", () => {
                files.push({
                    fieldname,
                    filename,
                    content: Buffer.concat(chunks),
                    mimetype
                });
            });
        });

        busboy.on("field", (fieldname, value) => {
            fields[fieldname] = value;
        });

        busboy.on("finish", () => {
            resolve({ fields, files });
        });

        const body = Buffer.from(event.body, "base64");
        busboy.end(body);
    });

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const contentType = event.headers["content-type"] || event.headers["Content-Type"];
        if (!contentType?.startsWith("multipart/form-data"))
            return createErrorResponse(400, "Content-Type debe ser multipart/form-data");

        const { fields, files } = await parseMultipartForm(event);
        if (files.length === 0)
            return createErrorResponse(400, "No se ha subido ningun archivo");

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );

        const formData = new FormData();
        formData.append('company', "ACP");
        formData.append('session', calimacoSession);
        formData.append('type', fields['type']);
        formData.append('sub_type', fields['sub_type']);
        formData.append('side', fields['side']);
        formData.append('payment_account', fields['payment_account'] ? fields['payment_account'].toString() : '');

        const file = files[0];
        

        formData.append("myFile", file.content, {
            filename: file.filename,
            contentType: file.mimetype,
        });

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/uploadFile`, formData);

        if (data.code == -15) {
            console.error("API uploadFile:", data);
            return createErrorResponse(400, "Completar los campos obligatorios");
        }

        if (data.code == -10) {
            console.error("API uploadFile:", data);
            return createErrorResponse(401, "El payment_account ingresado no es válido");
        }

        if (data.result == "error") {
            console.error("API uploadFile:", data);
            return createErrorResponse(500, "Ocurrio un error inesperado");
        }

        return createResponse(200, data);
    } catch (err) {
        if (err?.statusCode) {
            return err;
        }

        console.error("Lambda execution error:", err);
        return createErrorResponse(500, "Ocurrio un error inesperado");
    }
};
