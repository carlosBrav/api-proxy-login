import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, DeleteConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import crypto from 'crypto';

const IS_OFFLINE = process.env.IS_OFFLINE === 'true';
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = process.env.WS_CONNECTIONS_TABLE;
const WS_JWT_SECRET = process.env.WS_JWT_SECRET || 'local-secret-key-for-testing-only';

const dynamoClient = new DynamoDBClient(IS_OFFLINE ? { endpoint: DYNAMODB_ENDPOINT } : {});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verifyJwt = (token, secret) => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [encodedHeader, encodedData, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedData}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (signature !== expectedSignature) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired');
  return payload;
};

export const lambda_handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 401, body: "Missing token" };
  }

  try {
    const payload = verifyJwt(token, WS_JWT_SECRET);
    const identityKey = payload.sub; // GUEST#... or USER#...

    // Check for existing connection (Eviction logic)
    const getRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: identityKey }
    }));

    if (getRes.Item && getRes.Item.connectionId) {
      const oldConnectionId = getRes.Item.connectionId;
      if (oldConnectionId !== connectionId) {
        // Evict old connection
        if (!IS_OFFLINE) {
          const apigwManagementApi = new ApiGatewayManagementApiClient({
            endpoint: `https://${domain}/${stage}`
          });
          try {
            await apigwManagementApi.send(new DeleteConnectionCommand({ ConnectionId: oldConnectionId }));
            console.log(`Evicted old connection: ${oldConnectionId}`);
          } catch (e) {
            console.warn(`Failed to evict old connection ${oldConnectionId}, might already be closed.`, e.message);
          }
        } else {
          console.log(`[LOCAL] Would evict old connection: ${oldConnectionId}`);
        }
      }
    }

    // Save new connection
    const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: identityKey,
        connectionId: connectionId,
        ttl: ttl
      }
    }));

    // Also save a reverse mapping to easily delete on $disconnect
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: `CONN#${connectionId}`,
        identityKey: identityKey,
        ttl: ttl
      }
    }));

    return { statusCode: 200, body: "Connected" };
  } catch (error) {
    console.error("Connection error:", error);
    return { statusCode: 401, body: "Unauthorized" };
  }
};