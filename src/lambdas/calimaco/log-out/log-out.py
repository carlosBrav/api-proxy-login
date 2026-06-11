import json
import logging
import os
import boto3
import requests

FN_CRYPTO = os.environ.get('FN_CRYPTO')

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

def invoke_crypto(session: str) -> str:
    """
    Invoca la función Lambda Crypto.
    """
    try:
        body = {
            'mode': "decrypt",
            'payload': session
        }

        logger.info("Datos enviados a crypto-function %s", json.dumps(body, indent=4))

        response = lambda_client.invoke(
            FunctionName=FN_CRYPTO,
            InvocationType='RequestResponse',       
            Payload=json.dumps(body)
        )

        payload = json.loads(response['Payload'].read())
        logger.info("Respuesta de crypto_function: %s", json.dumps(payload, indent=4))

        return payload.get('body', "")
    except Exception as ex:
        logger.error("Error al invocar crypto-function: %s", str(ex))

def decode_jwt_from_event(event):
    try:
        token = event["requestContext"]["authorizer"]["claims"]
        return token
    except KeyError:
        return {"error": "No se pudo obtener el token del contexto"}

def get_token_from_event(event):
    try:
        token = event["headers"]["Authorization"].replace("Bearer ", "")
        return token
    except KeyError:
        return {"error": "No se pudo obtener el token del contexto"}

def lambda_handler(event, context):
    try:

        token_payload = decode_jwt_from_event(event)
        if "error" in token_payload:
            return {
                'statusCode': 401,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({'message': 'Sin Autorización'})
            }

        session = token_payload.get("session_col", "")
        if not session:
            return {
                'statusCode': 400,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({'message': 'No se encontró la sesión en el token'})
            }
        logger.info(f"Session extraída: {session}")

        #url = "https://cognito-idp.us-west-2.amazonaws.com"
        #headers = {
        #    "Content-Type": "application/x-amz-json-1.1", 
        #    "X-Amz-Target": "AWSCognitoIdentityProviderService.GlobalSignOut"
        #}
        #payload = {
        #    "AccessToken": get_token_from_event(event)
        #}

        #logger.info(f"Enviando POST a {url} con payload: {payload}")
        #response = requests.post(url, headers=headers, body=payload)

        calimaco_session = invoke_crypto(session)

        url = "https://api.casinoatlanticcity.com/api/auth/logout"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        payload = {
            "company": "ACP",
            "session": calimaco_session
        }

        logger.info(f"Enviando POST a {url} con payload: {payload}")
        response = requests.post(url, headers=headers, data=payload)

        try:
            response_body = response.json()
        except ValueError:
            response_body = response.text
        

        return {
            'statusCode': response.status_code,
            'headers': {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json"
            },
            'body': json.dumps(response_body)
        }

    except Exception as e:
        logger.error(f"Error en la solicitud: {e}")
        return {
            'statusCode': 500,
            'headers': {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json"
            },
            'body': json.dumps({
                'message': 'Ocurrió un error inesperado'
            })
        }
