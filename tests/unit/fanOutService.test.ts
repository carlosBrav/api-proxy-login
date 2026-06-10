import { test } from 'node:test';
import assert from 'node:assert/strict';

test('FanOut en modo local registra payload en consola', async () => {
  process.env.NODE_ENV = 'test';
  process.env.IS_OFFLINE = 'true';
  process.env.USE_LOCAL_FANOUT_LOG = 'true';
  process.env.REDIS_ENABLED = 'false';

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  const { createFanOutService } = await import('../../src/pubsub/FanOutService');
  const fanOut = createFanOutService();

  await fanOut.deliver({
    type: 'patch',
    version: '2026-06-10T12:00:00.000Z',
    serverTime: '2026-06-10T12:00:00.000Z',
    updates: [
      {
        external_id: '2601',
        idProveedor: 2,
        realtime: { updatedAt: '2026-06-10T12:00:00.000Z', minBet: 5 },
      },
    ],
  });

  console.log = originalLog;

  const fanOutLine = logs.find((line) => line.includes('[FanOut:local]'));
  assert.ok(fanOutLine, 'debe loguear con prefijo [FanOut:local]');
  assert.match(fanOutLine!, /"external_id":"2601"/);
});

test('PatchPublisher sin Redis entrega directo al FanOut', async () => {
  process.env.NODE_ENV = 'test';
  process.env.IS_OFFLINE = 'true';
  process.env.USE_LOCAL_FANOUT_LOG = 'true';
  process.env.REDIS_ENABLED = 'false';

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  const { createFanOutService } = await import('../../src/pubsub/FanOutService');
  const { createPatchPublisher } = await import('../../src/pubsub/PatchPublisher');

  const fanOut = createFanOutService();
  const publisher = createPatchPublisher(null, fanOut);

  publisher.publish([
    {
      external_id: 'THBTable00000001',
      idProveedor: 1,
      realtime: { updatedAt: '2026-06-10T12:00:00.000Z' },
    },
  ]);

  console.log = originalLog;

  assert.ok(logs.some((line) => line.includes('[FanOut:local]')));
  assert.ok(logs.some((line) => line.includes('THBTable00000001')));
});
