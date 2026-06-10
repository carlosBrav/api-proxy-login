process.env.NODE_ENV = 'test';
process.env.IS_OFFLINE = 'false';
process.env.USE_LOCAL_FANOUT_LOG = 'false';
process.env.REDIS_ENABLED = 'false';
process.env.API_GATEWAY_WS_MANAGEMENT_ENDPOINT =
  'https://example.execute-api.us-east-1.amazonaws.com/prod';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';

test('FanOut en prod llama PostToConnection por cada connectionId', async () => {
  const sent: Array<{ connectionId: string; data: string }> = [];

  const { createFanOutService } = await import('../../src/pubsub/FanOutService');

  const mockClient = {
    send: async (command: {
      input: { ConnectionId?: string; Data?: Uint8Array };
    }) => {
      const connectionId = command.input.ConnectionId ?? '';
      if (connectionId === 'gone-id') {
        throw new GoneException({ message: 'Gone', $metadata: {} });
      }
      sent.push({
        connectionId,
        data: Buffer.from(command.input.Data ?? []).toString('utf8'),
      });
    },
  };

  const fanOut = createFanOutService({
    apigwClient: mockClient as never,
    getConnectionIds: async () => ['conn-1', 'gone-id', 'conn-2'],
  });

  await fanOut.deliver({
    type: 'patch',
    version: '2026-06-10T12:00:00.000Z',
    serverTime: '2026-06-10T12:00:00.000Z',
    updates: [
      {
        external_id: '2601',
        idProveedor: 2,
        realtime: { updatedAt: '2026-06-10T12:00:00.000Z' },
      },
    ],
  });

  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map((entry) => entry.connectionId).sort(),
    ['conn-1', 'conn-2']
  );
  assert.match(sent[0]!.data, /"type":"patch"/);
});
