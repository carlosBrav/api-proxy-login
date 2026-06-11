import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import crypto from 'crypto';

const IS_OFFLINE = process.env.IS_OFFLINE === 'true';
const REGION = process.env.AWS_REGION || 'us-west-2';
const IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;
const WS_JWT_SECRET = process.env.WS_JWT_SECRET || 'local-secret-key-for-testing-only';
const WS_API_ENDPOINT = process.env.WS_API_ENDPOINT || 'ws://localhost:8081';

const cognitoClient = new CognitoIdentityClient(IS_OFFLINE ? { region: REGION, endpoint: 'http://localhost:9229' } : { region: REGION });

const base64url = (str) => Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const signJwt = (payload, secret, expiresInSeconds) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = { ...payload, exp };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedData = base64url(JSON.stringify(data));
  const signature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedData}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encodedHeader}.${encodedData}.${signature}`;
};

export const lambda_handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    let guestId = body.guestId;

    if (!IS_OFFLINE) {
      if (!guestId) {
        const response = await cognitoClient.send(new GetIdCommand({ IdentityPoolId: IDENTITY_POOL_ID }));
        guestId = response.IdentityId;
      }
    } else {
      // Local mock
      if (!guestId) {
        guestId = `${REGION}:mock-guest-${crypto.randomUUID()}`;
      }
    }

    const expiresIn = parseInt(process.env.WS_TOKEN_EXPIRES_IN || '3600', 10);
    const wsToken = signJwt({ sub: `GUEST#${guestId}`, type: 'guest' }, WS_JWT_SECRET, expiresIn);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        guestId,
        wsUrl: WS_API_ENDPOINT,
        wsToken,
        expiresIn
      })
    };
  } catch (error) {
    console.error("Error in guest-session:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};