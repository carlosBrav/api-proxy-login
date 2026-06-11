import json
import logging
import requests
import boto3
import os
from typing import Dict, Any

FN_CRYPTO = os.environ.get('FN_CRYPTO')

# Configuración del logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

# Lambda Invoke
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

def lambda_handler(event: Dict[str, Any], context: Any):

    try:

        token_payload = decode_jwt_from_event(event)
        if "error" in token_payload:
            return {
                'statusCode': 401,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,GET",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({"message": "Sin Autorización"})
            }

        session = token_payload.get("session_col", "")
        logger.info(f"session {session}")

        sessionCol = invoke_crypto(session)
        logger.info(sessionCol)
        
        url = "https://api.casinoatlanticcity.com/api/data/getUserDetails"

        payload = f"company=ACP&session={sessionCol}"
        headers = {
            'accept': 'application/json, text/plain, /',
            'access-control-allow-origin': '*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        }
        logger.info("Datos enviados a USER-DETAILS %s", json.dumps(payload, indent=4))
        response = requests.request("POST", url, headers=headers, data=payload)

        user_detail = response.json()
        logger.info(f"response.json {user_detail}")

        if user_detail.get("code", 0) != 0:
            return {
                'statusCode': 401,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,GET",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({"message": "Sin Autorización"})
            }

        try:
            accounts_list = user_detail.get("user", {}).get("accounts", [])
            
            if accounts_list:
                for account in accounts_list:
                    original_amount = account.get('amount')
                    
                    if isinstance(original_amount, (int, float)):
                        new_amount_float = original_amount / 100.0
                        
                        account['amount'] = round(new_amount_float, 2)
                        
                    elif original_amount is None:
                        account['amount'] = 0.0

        except Exception as parse_ex:
            logger.error(f"Error al parsear decimales de 'accounts': {str(parse_ex)}")

        return {
                'statusCode': 200,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,GET",
                    "Content-Type": "application/json"
                },
                'body': json.dumps(user_detail)
            }

    except Exception as e:
        logger.error(f"Error en la solicitud: {e}")
        return {
            'statusCode': 500,
            'headers': {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,GET",
                "Content-Type": "application/json"
            },
            'body': json.dumps({
                'message': 'Ocurrió un error inesperado'
            })
        }
