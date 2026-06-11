import json
from json.decoder import JSONDecodeError
import requests
import re
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def is_valid_email(email):
    pattern = r"(^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$)"
    return re.match(pattern, email) is not None


def lambda_handler(event, context):
    try:
        url = "https://api.casinoatlanticcity.com/api/auth/forgotPassword"

        # Obtener parámetros desde event
        body = json.loads(event.get("body") or "{}")

        company = "ACP"
        email = body.get("email", "")

        # Verificar si alguno es None
        if not email:
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST",
                    "Content-Type": "application/json",
                },
                "body": json.dumps({"message": "Completar los campos obligatorios"}),
            }

        if not is_valid_email(email):
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST",
                    "Content-Type": "application/json",
                },
                "body": json.dumps(
                    {"message": "El email ingresado no tiene un formato válido"}
                ),
            }

        payload = {"company": company, "email": email}

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        response = requests.post(url, data=payload, headers=headers, timeout=10)
        return {
            "statusCode": response.status_code,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json",
            },
            "body": json.dumps(response.json()),
        }
    except requests.exceptions.Timeout:
        return {
            "statusCode": 504,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"message": "Timeout - No response from server"}),
        }
    except AttributeError:
        return {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"message": "Completar los campos obligatorios"}),
        }
    except JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"message": "Completar los campos obligatorios"}),
        }
    except Exception as ex:
        logger.error("Unhandled exception: %s", str(ex))
        
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"message": "Ocurrió un error inesperado"}),
        }
