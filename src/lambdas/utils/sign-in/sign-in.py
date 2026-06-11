import logging
import time
import json
import requests
import boto3
import urllib.parse
import hmac
import base64
import hashlib
import os
import json
from typing import Optional, Dict, Any, Union
from http import HTTPStatus

# Logger configuration
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Enviroments Variables
COGNITO_URL = os.environ.get('COGNITO_URL')
CLIENT_ID = os.environ.get('CLIENT_ID')
FN_CRYPTO = os.environ.get('FN_CRYPTO')
USER_POOL_ID = os.environ.get('USER_POOL_ID')
CLIENT_SECRET = os.environ.get('CLIENT_SECRET')

lambda_client = boto3.client('lambda')
cognito_client = boto3.client('cognito-idp')

# Custom Exception
class ApiException(Exception):
    def __init__(self, message: str, status_code: int = HTTPStatus.BAD_REQUEST):
        super().__init__(message)
        self.status_code = status_code
        self.message = message

    def to_dict(self):
        return {
            "message": self.message,
            'error': str(self)
        }

class LoginErrorException(Exception):
    def __init__(self, event: str, result: str, code: int, description: str, theme: str = "casino"):
        super().__init__(description)
        self.event = event
        self.result = result
        self.code = code
        self.description = description
        self.theme = theme
        self.status_code = HTTPStatus.UNAUTHORIZED

    def to_dict(self):
        error_info = self._get_login_error_response()
        return {
            "event": self.event,
            "result": self.result,
            "code": self.code,
            "message": error_info["message"],
            "linkText": error_info.get("linkText"),
            "linkPath": error_info.get("linkPath"),
            "action": error_info.get("action"),
            "variant": error_info["variant"]
        }

    def _get_login_error_response(self):
        base_path = "apuestas-deportivas" if self.theme == "apuestas" else "casino-online"
        
        error_responses = {
            1: {
                "message": "Usuario y/o contraseña incorrecta, inténtalo de nuevo o ",
                "linkText": "restablece tu contraseña",
                "linkPath": f"/{base_path}/forgotPassword",
                "action": "openWebsite",
                "variant": "error"
            },
            2: {
                "message": "Para tu seguridad y debido al máximo de intentos fallidos, es necesario ",
                "linkText": "restablecer tu contraseña",
                "linkPath": f"/{base_path}/forgotPassword",
                "action": "openWebsite",
                "variant": "warning"
            },
            3: {
                "message": "Se restringió el acceso a tu cuenta. Escríbenos por nuestro chat online si necesitas ayuda. ",
                "linkText": "Ir a la web",
                "linkPath": "/",
                "action": "openWebsite",
                "variant": "warning"
            },
            -25: {
                "message": "Se restringió el acceso a tu cuenta. Escríbenos por nuestro chat online si necesitas ayuda. ",
                "linkText": "Ir a la web",
                "linkPath": "/",
                "action": "openWebsite",
                "variant": "warning"
            },
            -1: {
                "message": "No se ha podido hacer login, intentelo de nuevo más tarde.",
                "linkText": None,
                "linkPath": None,
                "action": None,
                "variant": "warning"
            }
        }
        
        return error_responses.get(self.code, {
            "message": self.description,
            "linkText": None,
            "linkPath": None,
            "action": None,
            "variant": "error"
        })


def get_cors_headers(origin=None):
    """
    Genera los headers de CORS. Unifica la lógica y asegura fallbacks.
    """
    # 1. Definir la lista de permitidos
    allowed_origins = [
        "https://webview-sportsbook.casinoatlanticcity.com",
        "https://app-altenar.acity.com.pe",
        "https://acity.com.pe",
        "https://casinoatlanticcity.com",
        "https://altenar-webview.netlify.app",
        "https://altenar-qa-stark2.netlify.app",
        "https://altenar-app.acity.com.pe",
        # Localhost development
        "http://localhost:3000", "http://localhost:5173", 
        "http://localhost:8080", "http://localhost:5014"
    ]
    
    # 2. Configuración base
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Theme, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
    }
    
    # 3. Lógica de selección de Origin
    if not origin:
        # Fallback crítico: si el webview no envía origin, asumimos que es el sitio legítimo
        cors_headers["Access-Control-Allow-Origin"] = "https://webview-sportsbook.casinoatlanticcity.com"
    
    elif origin in allowed_origins:
        cors_headers["Access-Control-Allow-Origin"] = origin
        
    elif origin.startswith("http://localhost") or origin.startswith("https://localhost"):
        cors_headers["Access-Control-Allow-Origin"] = origin
        
    elif "acity.com" in origin or "casinoatlanticcity.com" in origin:
        cors_headers["Access-Control-Allow-Origin"] = origin
        
    else:
        # Fallback final por seguridad
        cors_headers["Access-Control-Allow-Origin"] = "https://webview-sportsbook.casinoatlanticcity.com"

    return cors_headers

# Lambda Invoke
def invoke_crypto(session: str) -> str:
    """
    Invoca la función Lambda Crypto.
    """
    try:
        body = {
            'mode': "encrypt",
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

def usuario_existe(user_pool_id, username):
    try:
        cognito_client.admin_get_user(
            UserPoolId=user_pool_id,
            Username=username
        )
        return True
    except cognito_client.exceptions.UserNotFoundException:
        return False
    except Exception as ex:
        print(f"Error al consultar Cognito: {ex}")
        raise

def crear_usuario_en_cognito(username, password):
    try:
        cognito_client.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=username,
            MessageAction='SUPPRESS'  # No envía email automático
        )

        # Establecer contraseña
        cognito_client.admin_set_user_password(
            UserPoolId=USER_POOL_ID,
            Username=username,
            Password=password,
            Permanent=True 
        )

        print("Usuario creado en Cognito.")

    except Exception as ex:
        print(f"Error al crear usuario en Cognito: {ex}")
        raise

# HTTP utility
def call_request(method: str, url: str, headers: Optional[Dict[str, str]] = None, data: Optional[Union[Dict[str, Any], str]] = None, json_body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        response = requests.request(
            method=method.upper(),
            url=url,
            headers=headers,
            data=data,
            json=json_body,
            timeout=60
        )
        response.raise_for_status()
        parsed = response.json()
        
        return {"status_code": response.status_code, "response": parsed, "ok": True}
    except requests.exceptions.RequestException as e:
        print(e)
        return {
            "status_code": getattr(e.response, "status_code", HTTPStatus.INTERNAL_SERVER_ERROR),
            "response": str(e),
            "ok": False
        }


# Cognito Services
def call_login_calimaco(username: str, password: str, theme: str = "casino"): 
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    payload = {
        "company": "ACP",
        "alias": username,
        "password": password
    }
    response = call_request(method= "POST", url="https://api.casinoatlanticcity.com/api/auth/login", headers=headers, data=urllib.parse.urlencode(payload))

    # Verificar si la respuesta HTTP fue exitosa
    if not response["ok"]:
        raise ApiException("Error de comunicación con el servicio de login", HTTPStatus.SERVICE_UNAVAILABLE)
    
    response_data = response["response"]
    
    # Verificar si hay un error de login específico (status 200 pero con error)
    if response_data.get("event") == "loginError" and response_data.get("result") == "error":
        raise LoginErrorException(
            event=response_data.get("event", "loginError"),
            result=response_data.get("result", "error"),
            code=response_data.get("code", -1),
            description=response_data.get("description", "Error de login"),
            theme=theme
        )
    
    # Verificar si el resultado no es OK (para mantener compatibilidad con el código anterior)
    if response_data.get("result") != "OK":
        raise ApiException(response_data.get("description", "Error en Calimaco Login"), HTTPStatus.UNAUTHORIZED)
    
    return response_data["user"]

def call_get_user_detail(session: str):

    payload = f"company=ACP&session={session}"
    headers = {
        'accept': 'application/json, text/plain, /',
        'access-control-allow-origin': '*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }
    
    response = call_request(method= "POST", url="https://api.casinoatlanticcity.com/api/data/getUserDetails", headers=headers, data=payload)

    return response


def call_init_auth_service(client_id: str, username: str, secret_hash: str) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
    }
    payload = {
        "AuthFlow": "CUSTOM_AUTH",
        "ClientId": client_id,
        "AuthParameters": {
            "USERNAME": username,
            "SECRET_HASH": secret_hash
        }
    }
    return call_request(method= "POST", url=COGNITO_URL, headers=headers, json_body=payload)

def call_auth(client_id: str, username: str, answer: str, secret_hash: str, session: str) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.RespondToAuthChallenge"
    }
    payload = {
        "ChallengeName": "CUSTOM_CHALLENGE",
        "ClientId": client_id,
        "ChallengeResponses": {
            "USERNAME": username,
            "ANSWER": answer,
            "SECRET_HASH": secret_hash
        },
        "Session": session
    }
    
    return call_request(method= "POST", url=COGNITO_URL, headers=headers, json_body=payload)

def generate_hash(username: str):
    message = username + CLIENT_ID
    dig = hmac.new(
            key=CLIENT_SECRET.encode('utf-8'),
            msg=message.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()
    
    hash_generated = base64.b64encode(dig).decode()

    return hash_generated

# Lambda handler
def lambda_handler(event, context):
    try:
        logger.info("Evento: %s", json.dumps(event))

        headers = event.get("headers", {})
        origin = headers.get("origin") or headers.get("Origin")
        logger.info("Origin: %s", origin)
        
        # Manejar preflight OPTIONS request para CORS
        if event.get("httpMethod") == "OPTIONS":
            logger.info("Handling CORS preflight request")
            return {
                "statusCode": HTTPStatus.OK,
                "headers": get_cors_headers(origin),
                "body": json.dumps({"message": "CORS preflight successful"})
            }

        #1. Obtener los datos del payload (username, password)
        body = json.loads(event.get("body") or "{}")
        username = body.get("username")
        password = body.get("password")

        if not username or not username.strip() or not password or not password.strip():
            return {
                'statusCode': 400,
                'headers': get_cors_headers(origin),
                'body': json.dumps({"message": "Completar los campos obligatorios"})
            }

        # Extraer el tema desde los headers o query params si está disponible
        # Si no se especifica, usar "casino" por defecto
        theme = (
            headers.get("x-theme") or 
            headers.get("X-Theme") or 
            body.get("theme") or 
            "casino"
        )
        
        # Validar que el tema sea uno de los soportados, si no usar casino por defecto
        if theme not in ["casino", "apuestas"]:
            theme = "casino"

        logger.info("Origin: %s, Theme: %s", origin, theme)

        #2. Validar si las credenciales son correctas
        logger.info("Request in API_CALIMACO")
        calimaco_user = call_login_calimaco(username, password, theme)
        session_token = calimaco_user.get("session", "")

        if not usuario_existe(USER_POOL_ID, username):
            crear_usuario_en_cognito(username, password)
            logger.info("se creo el usuario emn cognito ")

        #3. Obtener el hash
        logger.info("Call Function GENERATE-HASH")
        secret_hash = generate_hash(username)

        #4. Validar Authenticación
        logger.info("Request in API INIT-AUTH")
        init_auth = call_init_auth_service(CLIENT_ID, username, secret_hash)

        if not init_auth.get("ok"):
            raise ApiException(f"Error en INIT_AUTH: {init_auth.get('response')}", init_auth.get("status_code", 500))

        session = init_auth["response"].get("Session")

        #5. Encrypt Session Calimaco
        logger.info("Request in LAMBDA CRYTO")
        encrypted_session = invoke_crypto(session_token)

        #6. Generar Token
        auth_result = call_auth(CLIENT_ID, username, encrypted_session, secret_hash, session)
        logger.info(f"Enviando POST a API_AUTH con result: {json.dumps(auth_result)}")

        if not auth_result.get("ok"):
            raise ApiException(f"Error en AUTH: {auth_result.get('response')}", auth_result.get("status_code", 500))

        auth_data = auth_result["response"].get("AuthenticationResult", {})

        detail_result = call_get_user_detail(session_token)
        if not auth_result.get("ok"):
            raise ApiException(f"Error en AUTH: {auth_result.get('response')}", auth_result.get("status_code", 500))

        calimaco_detail_data = detail_result["response"].get("user", {})
        
        print(detail_result)
        
        return {
            "statusCode": 200,
            "headers": get_cors_headers(origin),
            "body": json.dumps({
                "AccessToken": auth_data.get("AccessToken"),
                "IdToken": auth_data.get("IdToken"),
                "RefreshToken": auth_data.get("RefreshToken"),
                "ExpiresIn": auth_data.get("ExpiresIn"),
                "user": {
                    "session": calimaco_user.get("session"),
                    "alias": calimaco_user.get("alias"),
                    "user": calimaco_user.get("user"),
                    "email": calimaco_user.get("email"),
                    "status": calimaco_user.get("status"),
                    "db": calimaco_user.get("db"),
                    "country": calimaco_user.get("country"),
                    "lastLogin": calimaco_user.get("lastLogin"),
                    "company": calimaco_user.get("company"),
                    "national_id": calimaco_user.get("national_id"),
                    "ip_login_errors": calimaco_user.get("ip_login_errors"),
                    "otp": calimaco_user.get("otp"),
                    "facebook_id": calimaco_user.get("facebook_id"),
                    "google_id": calimaco_user.get("google_id"),
                    "client_device": calimaco_user.get("client_device"),
                    "groups": calimaco_detail_data.get("groups"),
                    "currency": calimaco_detail_data.get("currency"),
                    "birthday": calimaco_detail_data.get("birthday"),
                    "gender": calimaco_detail_data.get("gender"),
                }
            })
        }
    except LoginErrorException as e:
        logger.error("LoginErrorException: Event=%s, Result=%s, Code=%s, Description=%s", 
                    e.event, e.result, e.code, e.description)
        return {
            "statusCode": e.status_code,
            "headers": get_cors_headers(origin),
            "body": json.dumps(e.to_dict())
        }
    except ApiException as ex:
        logger.error("API Error: %s", ex.message)
        return {
            "statusCode": 400,
            "headers": get_cors_headers(origin),
            "body": json.dumps({
                "message": ex.message
            })
        }

    except Exception as ex:
        logger.error("Unhandled exception: %s", str(ex))
        return {
            "statusCode": 500,
            "headers": get_cors_headers(origin),
            "body": json.dumps({
                "message": "Ocurrió un error inesperado"
            })
        }
