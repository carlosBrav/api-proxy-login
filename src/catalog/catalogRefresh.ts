import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '../config/env';
import { CatalogGameRecord } from './CatalogGameRecord';

function createDocumentClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: env.AWS_REGION,
    ...(env.DYNAMODB_ENDPOINT
      ? {
          endpoint: env.DYNAMODB_ENDPOINT,
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID ?? 'test',
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? 'test',
          },
        }
      : {}),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

let docClient: DynamoDBDocumentClient | undefined;

function getClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = createDocumentClient();
  }
  return docClient;
}

/** Lobbies cuyo PK se consulta en DynamoDB (union de mesas autorizadas). */
export function getCatalogLobbies(): string[] {
  if (env.CATALOG_LOBBIES?.length) {
    return env.CATALOG_LOBBIES;
  }
  return [env.INGEST_LOBBY];
}

function buildPartitionKey(lobby: string): string {
  return `LOBBY#${env.INGEST_COMPANY}#${lobby}`;
}

async function queryLobbyPartition(
  client: DynamoDBDocumentClient,
  pk: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: env.CATALOG_TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const item of result.Items ?? []) {
      const record = item as CatalogGameRecord;
      if (record.ca_table_id) {
        ids.add(record.ca_table_id);
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return ids;
}

/**
 * Query DynamoDB por PK de cada lobby configurado y devuelve ca_table_id autorizados.
 */
export async function fetchAuthorizedTableIds(): Promise<Set<string>> {
  const client = getClient();
  const ids = new Set<string>();

  for (const lobby of getCatalogLobbies()) {
    const pk = buildPartitionKey(lobby);
    const lobbyIds = await queryLobbyPartition(client, pk);
    for (const id of lobbyIds) {
      ids.add(id);
    }
  }

  return ids;
}
