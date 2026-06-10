import Redis from 'ioredis';
import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';

const REDIS_HASH_KEY = 'live_games_state';

class LiveGamesStoreImpl {
  private store = new Map<string, LiveGamesTablePatch>();
  private redis: Redis | null = null;

  init(redis: Redis | null): void {
    this.redis = redis;
  }

  getAll(): LiveGamesTablePatch[] {
    return Array.from(this.store.values());
  }

  get(externalId: string): LiveGamesTablePatch | undefined {
    return this.store.get(externalId);
  }

  set(patch: LiveGamesTablePatch): void {
    this.store.set(patch.external_id, patch);

    if (this.redis?.status === 'ready') {
      this.redis.hset(REDIS_HASH_KEY, patch.external_id, JSON.stringify(patch)).catch(console.error);
    }
  }

  setMany(patches: LiveGamesTablePatch[]): void {
    for (const patch of patches) {
      this.set(patch);
    }
  }
}

export const liveGamesStore = new LiveGamesStoreImpl();
