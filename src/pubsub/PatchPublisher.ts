import Redis from 'ioredis';
import { env } from '../config/env';
import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';
import { RealtimePatchMessage } from '../domain/RealtimePatchMessage';
import { FanOutService } from './FanOutService';

function buildPatchMessage(updates: LiveGamesTablePatch[]): RealtimePatchMessage {
  const now = new Date().toISOString();
  return {
    type: 'patch',
    version: now,
    serverTime: now,
    updates,
  };
}

export class PatchPublisher {
  constructor(
    private readonly redis: Redis | null,
    private readonly fanOut: FanOutService
  ) {}

  publish(patches: LiveGamesTablePatch[]): void {
    if (patches.length === 0) return;

    const message = buildPatchMessage(patches);
    const payload = JSON.stringify(message);

    if (this.redis?.status === 'ready') {
      this.redis.publish(env.REDIS_PATCH_CHANNEL, payload).catch((err) => {
        console.error('[Redis] Error al publicar parche:', err);
        void this.fanOut.deliver(message);
      });
      return;
    }

    void this.fanOut.deliver(message);
  }
}

export function createPatchPublisher(
  redis: Redis | null,
  fanOut: FanOutService
): PatchPublisher {
  return new PatchPublisher(redis, fanOut);
}
