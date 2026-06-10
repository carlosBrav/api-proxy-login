import Redis from 'ioredis';
import { env } from '../config/env';

export function createRedisClient(): Redis | null {
  if (!env.REDIS_ENABLED) {
    console.log('[Redis] Deshabilitado (REDIS_ENABLED=false). Operando en memoria.');
    return null;
  }

  try {
    let errorLogged = false;

    const redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: env.REDIS_OPTIONAL ? 1 : 3,
      enableOfflineQueue: false,
      lazyConnect: env.REDIS_OPTIONAL,
      reconnectOnError: () => !env.REDIS_OPTIONAL,
      retryStrategy(times) {
        if (env.REDIS_OPTIONAL) {
          return null;
        }
        return Math.min(times * 50, 2000);
      },
    });

    redis.on('error', (err) => {
      if (errorLogged) {
        return;
      }
      errorLogged = true;
      console.warn(
        '[Redis] ⚠️ Sin conexión a Redis (fallback en memoria). ' +
          (env.REDIS_OPTIONAL
            ? 'Para silenciar intentos locales: REDIS_ENABLED=false en .env.local.'
            : err.message)
      );
    });

    redis.on('connect', () => {
      console.log('[Redis] ✅ Conectado exitosamente');
    });

    if (env.REDIS_OPTIONAL) {
      void redis.connect().catch(() => {
        redis.disconnect();
      });
    }

    return redis;
  } catch {
    console.warn('[Redis] ⚠️ No se pudo inicializar el cliente Redis. Operando en modo In-Memory.');
    return null;
  }
}

/** Conexión dedicada para SUBSCRIBE (ioredis exige cliente separado del publisher). */
export async function createRedisSubscriber(
  publisher: Redis | null
): Promise<Redis | null> {
  if (!publisher) return null;

  const subscriber = publisher.duplicate();

  try {
    if (subscriber.status !== 'ready') {
      await subscriber.connect();
    }
  } catch {
    subscriber.disconnect();
    return null;
  }

  return subscriber;
}
