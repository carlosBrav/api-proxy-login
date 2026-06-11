import json
import logging
from typing import Dict, Any

# Configuración del logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler para el flujo de autenticación personalizado basado en token.
    """
    try:
        logger.info("Evento recibido Define_Auth_Challenge: %s", json.dumps(event, indent=4))
        
        session = event.get('request', {}).get('session', [])
        
        if not session:
            event['response'] = {
                'challengeName': 'CUSTOM_CHALLENGE',
                'issueTokens': False,
                'failAuthentication': False
            }
            return event

        last_challenge = session[-1]
        challenge_name = last_challenge.get('challengeName')
        challenge_result = last_challenge.get('challengeResult')

        if challenge_name == 'CUSTOM_CHALLENGE' and challenge_result is True:
            event['response'] = {
                'issueTokens': True,
                'failAuthentication': False
            }
        elif challenge_result is False:
            if len(session) >= 3:
                event['response'] = {
                    'issueTokens': False,
                    'failAuthentication': True
                }
            else:
                event['response'] = {
                    'challengeName': 'CUSTOM_CHALLENGE',
                    'issueTokens': False,
                    'failAuthentication': False
                }
        else:
            event['response'] = {
                'challengeName': 'CUSTOM_CHALLENGE',
                'issueTokens': False,
                'failAuthentication': False
            }

        logger.info("Respuesta a enviar: %s", json.dumps(event, indent=4))
        return event

    except Exception as e:
        logger.error("Error durante el procesamiento: %s", str(e))
        raise
