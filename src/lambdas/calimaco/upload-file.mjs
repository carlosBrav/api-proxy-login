import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { randomBytes } from "crypto";

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

// Parser manual de multipart/form-data
function parseMultipartFormData(bodyBuffer, contentType) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) {
        throw new Error("No se encontró boundary en Content-Type");
    }
    
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const boundaryBuffer = Buffer.from(`--${boundary}`, 'utf8');
    
    const fields = {};
    let fileData = null;
    
    // Dividir el body por el boundary
    const parts = [];
    let start = 0;
    while (start < bodyBuffer.length) {
        const boundaryIndex = bodyBuffer.indexOf(boundaryBuffer, start);
        if (boundaryIndex === -1) break;
        
        if (start > 0) {
            parts.push(bodyBuffer.slice(start, boundaryIndex));
        }
        start = boundaryIndex + boundaryBuffer.length;
    }
    
    for (const part of parts) {
        if (part.length < 4) continue;
        
        // Buscar el final de los headers (\r\n\r\n)
        const headerEnd = part.indexOf(Buffer.from('\r\n\r\n', 'utf8'));
        if (headerEnd === -1) continue;
        
        const headerSection = part.slice(0, headerEnd).toString('utf8');
        const bodySection = part.slice(headerEnd + 4);
        
        // Remover el \r\n final si existe
        const actualBody = bodySection.length >= 2 && 
                          bodySection[bodySection.length - 2] === 0x0D && 
                          bodySection[bodySection.length - 1] === 0x0A 
                          ? bodySection.slice(0, -2) 
                          : bodySection;
        
        const dispositionMatch = headerSection.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/);
        if (!dispositionMatch) continue;
        
        const fieldName = dispositionMatch[1];
        const fileName = dispositionMatch[2];
        
        if (fileName) {
            // Es un archivo
            const contentTypeMatch = headerSection.match(/Content-Type: (.+)/);
            const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
            
            fileData = {
                fieldName,
                fileName,
                mimeType,
                data: actualBody
            };
        } else {
            // Es un campo de texto
            fields[fieldName] = actualBody.toString('utf8');
        }
    }
    
    return { fields, fileData };
}

// Constructor manual de multipart/form-data
function buildMultipartFormData(fields, file) {
    const boundary = '----WebKitFormBoundary' + randomBytes(16).toString('hex');
    const parts = [];
    
    // Agregar campos de texto
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
            parts.push(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                `${value}\r\n`
            );
        }
    }
    
    // Agregar archivo
    if (file) {
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="myFile"; filename="${file.fileName}"\r\n` +
            `Content-Type: ${file.mimeType}\r\n\r\n`
        );
        
        const finalBoundary = `\r\n--${boundary}--\r\n`;
        
        const headerBuffer = Buffer.from(parts.join(''), 'utf8');
        const footerBuffer = Buffer.from(finalBoundary, 'utf8');
        
        return {
            boundary,
            body: Buffer.concat([headerBuffer, file.data, footerBuffer])
        };
    }
    
    parts.push(`--${boundary}--\r\n`);
    return {
        boundary,
        body: Buffer.from(parts.join(''), 'utf8')
    };
}

async function callCalimacoApi(url, fields, file) {
    try {
        const { boundary, body } = buildMultipartFormData(fields, file);
        
        console.log(`Enviando request a ${url}, tamaño: ${body.length} bytes`);
        console.log("Campos enviados:", Object.keys(fields));
        console.log("Session (primeros 30 chars):", fields.session ? fields.session.substring(0, 30) + '...' : 'undefined');

        const response = await fetch(url, {
            method: "POST",
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length.toString()
            },
            body: body
        });

        console.log(`Response status: ${response.status} ${response.statusText}`);
        const data = await response.json();
        console.log("Response data:", data);

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
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw createErrorResponse(401, "Sin Autorización");
    }
}

function isValidString(value, name) {
    if (typeof value !== "string" || value.trim().length <= 0)
        throw createErrorResponse(400, `El parámetro '${name}' no es válido`);

    return value.trim();
}

export const lambda_handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    try {
        validateHeaders(event);

        const contentType = event.headers["content-type"] || event.headers["Content-Type"];
        if (!contentType?.startsWith("multipart/form-data"))
            return createErrorResponse(400, "Content-Type debe ser multipart/form-data");

        const claims = getClaims(event);
        const encryptedSession = claims.session_col;

        if (!encryptedSession) {
            console.error("No se encontró session_col en claims");
            return createErrorResponse(401, "Sesión no válida");
        }

        console.log("Desencriptando sesión...");
        const { body: calimacoSession } = await invokeLambda(FN_CRYPTO,
            {
                mode: "decrypt",
                payload: encryptedSession
            }
        );
        
        console.log("Sesión desencriptada exitosamente:", calimacoSession ? `${calimacoSession.substring(0, 20)}...` : 'null');

        // Decodificar body si viene en base64
        let bodyBuffer;
        if (event.isBase64Encoded) {
            bodyBuffer = Buffer.from(event.body, 'base64');
        } else {
            bodyBuffer = Buffer.from(event.body, 'utf8');
        }

        console.log(`Body recibido: ${bodyBuffer.length} bytes, base64Encoded: ${event.isBase64Encoded}`);

        // Parsear multipart/form-data manualmente
        const { fields, fileData } = parseMultipartFormData(bodyBuffer, contentType);
        
        console.log("Campos recibidos:", fields);
        console.log("Archivo recibido:", fileData ? `${fileData.fileName} (${fileData.data.length} bytes)` : 'ninguno');

        if (!fileData) {
            return createErrorResponse(400, "No se recibió ningún archivo");
        }

        const type = isValidString(fields.type, "type");
        const subType = fields.sub_type ? isValidString(fields.sub_type, "subType") : undefined;
        const side = isValidString(fields.side, "side");
        const paymentAccount = fields.payment_account ? isValidString(fields.payment_account, "paymentAccount") : undefined;

        // Preparar campos para la API externa
        const apiFields = {
            session: calimacoSession,
            name: fileData.fileName,
            type: type,
            sub_type: subType,
            side: side,
            company: "ACP"
        };
        
        if (paymentAccount) {
            apiFields.payment_account = paymentAccount;
        }

        // Preparar archivo para la API externa
        const apiFile = {
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
            data: fileData.data
        };

        console.log(`Enviando a Calimaco: ${fileData.fileName} (${fileData.mimeType}), ${fileData.data.length} bytes`);

        const { data } = await callCalimacoApi(`${CALIMACO_BASE_URL}/data/uploadFile`, apiFields, apiFile);

        if (data.code == -15) {
            console.error("API uploadFile:", data);
            return createErrorResponse(400, "Completar los campos obligatorios");
        }

        if (data.code == -10) {
            console.error("API uploadFile:", data);
            return createErrorResponse(400, "Error General con el Archivo");
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
