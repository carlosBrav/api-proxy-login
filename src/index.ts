import express from 'express';
import { createServer } from 'http';
import { env } from './config/env';
import { liveGamesRealtimeRouter } from './api/routes/liveGamesRealtime';
import { healthRouter } from './health/healthcheck';
import { registerAllAdapters } from './providers/mock/MockPatchGenerator';
import { createRedisClient, createRedisSubscriber } from './pubsub/RedisClient';
import { liveGamesStore } from './pubsub/LiveGamesStore';
import { createFanOutService } from './pubsub/FanOutService';
import { createPatchPublisher } from './pubsub/PatchPublisher';
import { catalogFilterService } from './catalog/CatalogFilterService';
import { startIngestionWorker } from './ingestion/IngestionWorker';

const app = express();
const server = createServer(app);

const redis = createRedisClient();
liveGamesStore.init(redis);

registerAllAdapters();

app.use(express.json());
app.use(healthRouter);
app.use(liveGamesRealtimeRouter);

const fanOut = createFanOutService();

async function bootstrap(): Promise<void> {
  if (env.NODE_ENV === 'development') {
    console.log(`[config] DYNAMODB_ENDPOINT=${env.DYNAMODB_ENDPOINT ?? 'unset'}`);
    console.log(`[config] IS_OFFLINE=${env.IS_OFFLINE}`);
    console.log(`[config] REDIS_PATCH_CHANNEL=${env.REDIS_PATCH_CHANNEL}`);
  }

  const redisSubscriber = await createRedisSubscriber(redis);
  await fanOut.start(redisSubscriber);

  const patchPublisher = createPatchPublisher(redis, fanOut);

  await catalogFilterService.refresh();
  catalogFilterService.startPeriodicRefresh();
  startIngestionWorker(patchPublisher);

  server.listen(env.PORT, () => {
    const catalogStatus = !catalogFilterService.isEnabled()
      ? 'deshabilitado'
      : catalogFilterService.getCatalogSize() > 0
        ? `${catalogFilterService.getCatalogSize()} mesas`
        : '0 mesas (vacío — revisa DynamoDB)';

    const fanOutMode =
      env.IS_OFFLINE || env.USE_LOCAL_FANOUT_LOG
        ? 'log local [FanOut:local]'
        : 'API Gateway Management API';

    console.log(`
=====================================================
🚀 BFF Live Games Streaming Iniciado
=====================================================
🌍 Entorno : ${env.NODE_ENV}
🔌 Puerto  : ${env.PORT}
📡 API REST: http://localhost:${env.PORT}/api/v1/live-games/realtime
📤 Fan-out : ${fanOutMode}
📮 Redis   : ${env.REDIS_PATCH_CHANNEL}
📋 Catálogo: ${catalogStatus}
=====================================================
    `);
  });
}

void bootstrap();
