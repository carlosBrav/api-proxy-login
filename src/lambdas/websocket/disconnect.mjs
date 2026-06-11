import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const IS_OFFLINE = process.env.IS_OFFLINE === 'true';
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = process.env.WS_CONNECTIONS_TABLE;

const dynamoClient = new DynamoDBClient(IS_OFFLINE ? { endpoint: DYNAMODB_ENDPOINT } : {});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const lambda_handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    // Find the identityKey associated with this connection
    const getRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: `CONN#${connectionId}` }
    }));

    if (getRes.Item && getRes.Item.identityKey) {
      const identityKey = getRes.Item.identityKey;

      // Ensure we only delete the identity mapping if it still points to THIS connection
      // (It might have been overwritten by a new connection during eviction)
      const identityRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: identityKey }
      }));

      if (identityRes.Item && identityRes.Item.connectionId === connectionId) {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: identityKey }
        }));
      }

      // Delete the reverse mapping
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: `CONN#${connectionId}` }
      }));
    }

    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Disconnect error:", error);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};