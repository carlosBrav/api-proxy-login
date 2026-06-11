import json
import logging
import os
import boto3
import requests

FN_CRYPTO = os.environ.get('FN_CRYPTO')

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
        # Aseguramos que se devuelva una cadena vacía en caso de excepción
        return "" 

def decode_jwt_from_event(event):
    try:
        token = event["requestContext"]["authorizer"]["claims"]
        return token
    except KeyError:
        return {"error": "No se pudo obtener el token del contexto"}

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        old_password = body.get("old_password")
        new_password = body.get("new_password")

        if not old_password or not old_password.strip() or not new_password or not new_password.strip():
            return {
                'statusCode': 400,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({"message": "Completar los campos obligatorios"})
            }

        token_payload = decode_jwt_from_event(event)
        if "error" in token_payload:
            return {
                'statusCode': 401,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({"message": "Sin Autorización"})
            }

        session = token_payload.get("session_col", "")
        logger.info(f"Session extraída: {session}")

        calimacoSession = invoke_crypto(session)
        
        # [ CAMBIO #1 ]# Manejo de sesión vacía (no desencriptada)
        if not calimacoSession:
            logger.warning("calimacoSession vacío. Posible token expirado o inválido.")
            return {
                'statusCode': 401,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                    "Content-Type": "application/json"
                },
                'body': json.dumps({"message": "Sesión inválida o expirada."})
            }
        
        # Continuar con la llamada a la API externa
        url = "https://api.casinoatlanticcity.com/api/data/updatePassword"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        payload = {
            "company": "ACP",
            "session": calimacoSession,
            "old_password": old_password,
            "new_password": new_password
        }

        response = requests.post(url, headers=headers, data=payload)
        
        # [ CAMBIO #2 ]# Intenta obtener el JSON de la respuesta
        api_data = {}
        try:
            api_data = response.json()
        except requests.exceptions.JSONDecodeError:
            # Si no se puede decodificar, usamos un mensaje de error genérico
            api_data = {"message": f"Error al decodificar la respuesta de la API externa (Status: {response.status_code})"}
        except Exception as json_ex:
            logger.error(f"Error inesperado al obtener JSON de respuesta: {json_ex}")
            api_data = {"message": "Error en el formato de respuesta de la API externa"}


        # [ CAMBIO #3 ]# Revisa el resultado para corregir el Status Code HTTP
        # Si la API devuelve 200 pero el cuerpo indica un error de negocio.
        if response.status_code == 200 and api_data.get("result") == "error":
            logger.error(f"Error de negocio detectado (Code: {api_data.get('code', 'N/A')}): {api_data}")
            
            # Asignamos 400 Bad Request para errores de negocio comunes (como contraseña antigua incorrecta)
            # Para errores de autenticación más graves (como 'session' inválida si no se capturó en el #1), se podría usar 401.
            status_to_return = 400 
            
            return {
                'statusCode': status_to_return,
                'headers': {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                    "Content-Type": "application/json"
                },
                'body': json.dumps(api_data) # Devuelve el error de negocio
            }
        
        # Devolver la respuesta tal como está (incluyendo 200 OK para éxito, o errores HTTP reales como 404, 500)
        return {
            'statusCode': response.status_code,
            'headers': {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                "Content-Type": "application/json"
            },
            'body': json.dumps(api_data)
        }

    except Exception as e:
        logger.error(f"Error en la solicitud: {e}")
        return {
            'statusCode': 500,
            'headers': {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,PATCH",
                "Content-Type": "application/json"
            },
            'body': json.dumps({
                'message': 'Ocurrió un error inesperado'
            })
        }