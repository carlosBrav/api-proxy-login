import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import Redis from 'ioredis';
import { env } from '../config/env';
import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';
import { RealtimePatchMessage } from '../domain/RealtimePatchMessage';
import { getActiveConnectionIds } from './ConnectionsRegistry';

function isRealtimePatchMessage(value: unknown): value is RealtimePatchMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as RealtimePatchMessage;
  return candidate.type === 'patch' && Array.isArray(candidate.updates);
}

function isLiveGamesTablePatch(value: unknown): value is LiveGamesTablePatch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as LiveGamesTablePatch;
  return typeof candidate.external_id === 'string' && Boolean(candidate.realtime);
}

function parsePatchPayload(raw: string): RealtimePatchMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (isRealtimePatchMessage(parsed)) {
      return parsed;
    }

    if (isLiveGamesTablePatch(parsed)) {
      const now = new Date().toISOString();
      return {
        type: 'patch',
        version: now,
        serverTime: now,
        updates: [parsed],
      };
    }

    console.warn('[FanOut] Mensaje Redis ignorado: formato no reconocido');
    return null;
  } catch {
    console.warn('[FanOut] Mensaje Redis ignorado: JSON inválido');
    return null;
  }
}

export interface FanOutServiceDeps {
  apigwClient?: ApiGatewayManagementApiClient;
  getConnectionIds?: () => Promise<string[]>;
}

export class FanOutService {
  private apigwClient: ApiGatewayManagementApiClient | null = null;
  private subscriber: Redis | null = null;
  private readonly getConnectionIds: () => Promise<string[]>;

  constructor(deps: FanOutServiceDeps = {}) {
    this.getConnectionIds = deps.getConnectionIds ?? getActiveConnectionIds;
    if (deps.apigwClient) {
      this.apigwClient = deps.apigwClient;
    }
  }

  async start(redisSubscriber: Redis | null): Promise<void> {
    if (!this.apigwClient && !env.IS_OFFLINE && env.API_GATEWAY_WS_MANAGEMENT_ENDPOINT) {
      this.apigwClient = new ApiGatewayManagementApiClient({
        region: env.AWS_REGION,
        endpoint: env.API_GATEWAY_WS_MANAGEMENT_ENDPOINT,
      });
      console.log('[FanOut] API Gateway Management API configurado');
    }

    if (!redisSubscriber) {
      console.log(
        '[FanOut] Sin suscriptor Redis — entrega directa desde PatchPublisher (modo local)'
      );
      return;
    }

    this.subscriber = redisSubscriber;

    this.subscriber.on('message', (channel, message) => {
      if (channel !== env.REDIS_PATCH_CHANNEL) return;
      const patchMessage = parsePatchPayload(message);
      if (patchMessage) {
        void this.deliver(patchMessage);
      }
    });

    await this.subscriber.subscribe(env.REDIS_PATCH_CHANNEL);
    console.log(`[FanOut] Suscrito a Redis ${env.REDIS_PATCH_CHANNEL}`);
  }

  async stop(): Promise<void> {
    if (this.subscriber?.status === 'ready') {
      await this.subscriber.unsubscribe(env.REDIS_PATCH_CHANNEL);
      this.subscriber.disconnect();
    }
  }

  async deliver(message: RealtimePatchMessage): Promise<void> {
    if (message.updates.length === 0) return;

    if (env.IS_OFFLINE || env.USE_LOCAL_FANOUT_LOG) {
      console.log('[FanOut:local]', JSON.stringify(message));
      return;
    }

    if (!this.apigwClient) {
      console.warn(
        '[FanOut] API_GATEWAY_WS_MANAGEMENT_ENDPOINT no configurado — parche descartado'
      );
      return;
    }

    const connectionIds = await this.getConnectionIds();
    if (connectionIds.length === 0) {
      console.debug('[FanOut] Sin connectionIds activos — nada que enviar');
      return;
    }

    const payload = Buffer.from(JSON.stringify(message));

    await Promise.all(
      connectionIds.map(async (connectionId) => {
        try {
          await this.apigwClient!.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: payload,
            })
          );
        } catch (err) {
          if (err instanceof GoneException) {
            console.debug(`[FanOut] Conexión stale eliminada: ${connectionId}`);
            return;
          }
          console.error(`[FanOut] Error PostToConnection ${connectionId}:`, err);
        }
      })
    );
  }
}

export function createFanOutService(deps?: FanOutServiceDeps): FanOutService {
  return new FanOutService(deps);
}
