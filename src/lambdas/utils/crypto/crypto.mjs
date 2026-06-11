import { encryptData, decryptData } from './util_encrypt_decrypt.mjs';

// const APP_CLIENTS = process.env.APP_CLIENTS;
const SECRET_KEY = process.env.SECRET_KEY;

export const lambda_handler = async (event, context, callback) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    const mode = event.mode || (event.body && JSON.parse(event.body).mode);
    const payload = event.payload || (event.body && JSON.parse(event.body).payload);
    // const app_client = event.client || (event.body && JSON.parse(event.body).client);

    if (!mode || !payload) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Falta el parámetro 'mode' o 'payload' en la solicitud." })
      };
    }

    const secret_key = SECRET_KEY;

    let result;
    if (mode === 'encrypt') {
      result = await encryptData(payload, secret_key);
    } else if (mode === 'decrypt') {
      result = await decryptData(payload, secret_key);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Modo inválido. Usa 'encrypt' o 'decrypt'." })
      };
    }

    return {
      statusCode: 200,
      body: result
    };

  } catch (error) {
    console.error('Error en lambda_handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Ocurrió un error interno: ${error.message}` })
    };
  }
};
