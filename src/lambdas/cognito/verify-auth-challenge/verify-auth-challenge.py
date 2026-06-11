import json
import logging
import boto3
import os
import redis
import traceback
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cache_redis_url = os.environ.get('CACHE_REDIS_URL')
cache_redis_port = os.environ.get('CACHE_REDIS_PORT')

# TTL común para session, refresh_token_col y device_id: 70 minutos
REDIS_TTL_SECONDS = 4200

lambda_client = boto3.client('lambda')

redis_client = redis.StrictRedis(
    host=cache_redis_url,
    port=cache_redis_port,
    decode_responses=True
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Verifica la respuesta al desafío Cognito y persiste 3 valores en Redis:

      - {userName}:session            → session de Calimaco cifrada (challengeAnswer)
      - {userName}:refresh_token_col  → refresh_token de Calimaco cifrado (clientMetadata)
      - {userName}:device_id          → device_id en plano (clientMetadata)

    Los lee pre-token-generation.py y los inyecta como claims del IdToken.
    El cliente NO ve estos valores como campos en el response — todo viaja
    DENTRO del IdToken. Si el cliente necesita refrescar la sesión, envía
    el IdToken como Bearer y el middleware extrae las claims server-side.
    """
    try:
        logger.info("[verify-auth] event received: %s", json.dumps(event, indent=2))

        response = event.copy()
        request = event.get('request', {}) or {}
        challenge_answer = request.get('challengeAnswer')
        client_metadata = request.get('clientMetadata') or {}

        logger.info("[verify-auth] has_challenge_answer=%s len=%s",
                    bool(challenge_answer),
                    len(challenge_answer) if challenge_answer else 0)
        logger.info("[verify-auth] clientMetadata_keys=%s", list(client_metadata.keys()))
        logger.info("[verify-auth] redis url=%s port=%s",
                    cache_redis_url, cache_redis_port)

        if not challenge_answer:
            logger.warning("[verify-auth] challengeAnswer ausente → answerCorrect=False")
            response['response'] = {'answerCorrect': False}
            return response

        username = response.get('userName')
        if not username:
            logger.error("[verify-auth] userName ausente en el evento")
            response['response'] = {'answerCorrect': False}
            return response

        logger.info("[verify-auth] username=%s", username)

        # 1. Persistir el session cifrado (challengeAnswer)
        try:
            redis_client.setex(f"{username}:session", REDIS_TTL_SECONDS, challenge_answer)
            logger.info("[verify-auth] redis SETEX %s:session ttl=%s", username, REDIS_TTL_SECONDS)
        except Exception as redis_err:
            logger.error("[verify-auth] Redis SETEX session failed: %s", str(redis_err))
            logger.error(traceback.format_exc())
            raise

        # 2. Persistir refresh_token cifrado si vino en clientMetadata
        refresh_token_col = client_metadata.get('refresh_token_col')
        if refresh_token_col:
            try:
                redis_client.setex(
                    f"{username}:refresh_token_col",
                    REDIS_TTL_SECONDS,
                    refresh_token_col
                )
                logger.info("[verify-auth] redis SETEX %s:refresh_token_col (len=%s)",
                            username, len(refresh_token_col))
            except Exception as redis_err:
                logger.error("[verify-auth] Redis SETEX refresh_token_col failed: %s", str(redis_err))
                # No re-raise: si Redis falla en clave opcional, seguimos
        else:
            logger.info("[verify-auth] refresh_token_col no vino en clientMetadata (login sin remember_me)")

        # 3. Persistir device_id en plano si vino
        device_id = client_metadata.get('device_id')
        if device_id:
            try:
                redis_client.setex(
                    f"{username}:device_id",
                    REDIS_TTL_SECONDS,
                    device_id
                )
                logger.info("[verify-auth] redis SETEX %s:device_id=%s", username, device_id)
            except Exception as redis_err:
                logger.error("[verify-auth] Redis SETEX device_id failed: %s", str(redis_err))
        else:
            logger.info("[verify-auth] device_id no vino en clientMetadata")

        response['response'] = {'answerCorrect': True}
        logger.info("[verify-auth] DONE — answerCorrect=True")
        return response

    except Exception as e:
        logger.error("[verify-auth] UNHANDLED EXCEPTION: %s", str(e))
        logger.error(traceback.format_exc())
        return {'response': {'answerCorrect': False}}
