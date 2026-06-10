import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config/env';

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({
      region: env.AWS_REGION,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
    docClient = DynamoDBDocumentClient.from(client);
  }
  return docClient;
}

/**
 * Resuelve connectionIds activos para PostToConnection.
 * MVP: FANOUT_CONNECTION_IDS (local) o Scan DynamoDB ws-connections (prod).
 * TODO: sustituir Scan por GSI o registry Redis `lobby:connections:active` (opción B infra).
 */
export async function getActiveConnectionIds(): Promise<string[]> {
  if (env.FANOUT_CONNECTION_IDS.length > 0) {
    return env.FANOUT_CONNECTION_IDS;
  }

  if (!env.CONNECTIONS_TABLE_NAME || env.IS_OFFLINE) {
    return [];
  }

  try {
    const result = await getDocClient().send(
      new ScanCommand({
        TableName: env.CONNECTIONS_TABLE_NAME,
        ProjectionExpression: 'connectionId',
      })
    );

    return (result.Items ?? [])
      .map((item) => item.connectionId as string | undefined)
      .filter((id): id is string => Boolean(id));
  } catch (err) {
    console.error('[FanOut] Error al leer conexiones DynamoDB:', err);
    return [];
  }
}
