import json
import logging
from typing import Dict, Any

# Configuración del logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler para Create_Auth_Challenge que prepara la validación
    del token de sesión existente.
    """
    try:
        logger.info("Evento recibido en Create_Auth_Challenge: %s", json.dumps(event, indent=4))

        event['response'] = {
            'publicChallengeParameters': {
                'type': 'SESSION_TOKEN'
            },
            'privateChallengeParameters': {},
            'challengeMetadata': 'EXTERNAL_SESSION_TOKEN'
        }

        logger.info("Respuesta de Create_Auth_Challenge: %s", json.dumps(event, indent=4))
        return event

    except Exception as e:
        logger.error("Error en Create_Auth_Challenge: %s", str(e))
        raise
