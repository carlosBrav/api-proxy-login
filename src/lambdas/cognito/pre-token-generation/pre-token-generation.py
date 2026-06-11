import json
import logging
import redis
import os
import traceback
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cache_redis_url = os.environ.get('CACHE_REDIS_URL')
cache_redis_port = os.environ.get('CACHE_REDIS_PORT')

# TTL común para session, refresh_token_col y device_id (70 min)
REDIS_TTL_SECONDS = 4200

redis_client = redis.StrictRedis(
    host=cache_redis_url,
    port=cache_redis_port,
    decode_responses=True
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Inyecta hasta 3 claims custom en el IdToken al emitirlo:

      - session_col       → session de Calimaco (cifrada)
      - refresh_token_col → refresh_token persistente de Calimaco (cifrado)
      - device_id         → identificador del dispositivo en Calimaco (plano)

    Cada uno se lee de Redis bajo `{userName}:{key}`. Si una clave no
    está presente, simplemente se OMITE de las claims (Cognito rechaza
    claimsToAddOrOverride con None).

    Refresca el TTL de las claves presentes en cada emisión para que
    sigan vivas mientras el usuario está activo.

    Este es el patrón clave del esquema B.1: el IdToken se vuelve el
    contenedor único de TODO lo que el middleware necesita server-side
    para autenticar al usuario y refrescar su sesión. El cliente solo
    guarda el IdToken como blob opaco.
    """
    try:
        logger.info("[pre-token] event received: %s", json.dumps(event, indent=2))

        response = event.copy()
        username = response.get('userName')
        if not username:
            logger.error("[pre-token] userName ausente en el evento")
            return response

        logger.info("[pre-token] username=%s, redis_url=%s, port=%s",
                    username, cache_redis_url, cache_redis_port)

        # Leer las 3 claves de Redis
        try:
            session = redis_client.get(f"{username}:session")
            refresh_token_col = redis_client.get(f"{username}:refresh_token_col")
            device_id = redis_client.get(f"{username}:device_id")
        except Exception as redis_err:
            logger.error("[pre-token] Redis GET failed: %s", str(redis_err))
            logger.error(traceback.format_exc())
            raise

        logger.info("[pre-token] session present=%s len=%s",
                    session is not None,
                    len(session) if session else 0)
        logger.info("[pre-token] refresh_token_col present=%s len=%s",
                    refresh_token_col is not None,
                    len(refresh_token_col) if refresh_token_col else 0)
        logger.info("[pre-token] device_id present=%s value=%s",
                    device_id is not None, device_id)

        # Refrescar TTL de las claves presentes (best-effort)
        try:
            if session:
                redis_client.setex(f"{username}:session", REDIS_TTL_SECONDS, session)
            if refresh_token_col:
                redis_client.setex(f"{username}:refresh_token_col", REDIS_TTL_SECONDS, refresh_token_col)
            if device_id:
                redis_client.setex(f"{username}:device_id", REDIS_TTL_SECONDS, device_id)
            logger.info("[pre-token] TTLs refreshed")
        except Exception as redis_err:
            logger.warning("[pre-token] Refresh TTL failed (continuing): %s", str(redis_err))

        # IMPORTANTE: Cognito rechaza claimsToAddOrOverride con None.
        # Solo incluimos claves con valor real.
        claims_to_add = {}
        if session:
            claims_to_add['session_col'] = session
        if refresh_token_col:
            claims_to_add['refresh_token_col'] = refresh_token_col
        if device_id:
            claims_to_add['device_id'] = device_id

        logger.info("[pre-token] claims to add: %s", list(claims_to_add.keys()))

        response['response']['claimsOverrideDetails'] = {
            'claimsToAddOrOverride': claims_to_add
        }

        logger.info("[pre-token] DONE")
        return response

    except Exception as e:
        logger.error("[pre-token] UNHANDLED EXCEPTION: %s", str(e))
        logger.error(traceback.format_exc())
        raise
