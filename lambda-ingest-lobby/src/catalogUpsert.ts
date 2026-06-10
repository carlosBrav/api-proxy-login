import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CatalogRecord } from './fieldMapper';

function createDocumentClient(): DynamoDBDocumentClient {
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment && !endpoint) {
    throw new Error(
      '[catalogUpsert] En desarrollo local se requiere DYNAMODB_ENDPOINT (p. ej. http://localhost:4566). ' +
        'Sin él, el SDK intentará escribir en DynamoDB real de AWS. ' +
        'Copia .env.local.example a .env.local o ejecuta npm run invoke:local.'
    );
  }

  const client = new DynamoDBClient({
    region,
    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
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

/**
 * Upsert idempotente en col_maestro_transversal_juegos vía PutItem.
 */
export async function upsertCatalogRecords(records: CatalogRecord[]): Promise<number> {
  const tableName = process.env.CATALOG_TABLE_NAME ?? 'col_maestro_transversal_juegos';
  const client = getClient();

  if (records.length === 0) {
    console.log(`[catalogUpsert] Sin registros para escribir en ${tableName}`);
    return 0;
  }

  for (const record of records) {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: record,
      })
    );
  }

  console.log(`[catalogUpsert] Escritos ${records.length} ítems en ${tableName}`);
  return records.length;
}
