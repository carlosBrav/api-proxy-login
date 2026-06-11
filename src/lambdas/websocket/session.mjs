import crypto from 'crypto';

const WS_JWT_SECRET = process.env.WS_JWT_SECRET || 'local-secret-key-for-testing-only';
const WS_API_ENDPOINT = process.env.WS_API_ENDPOINT || 'ws://localhost:8081';

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
    // This endpoint should be protected by Cognito Authorizer in API Gateway.
    // The authorizer context contains the claims.
    const claims = event.requestContext?.authorizer?.claims;
    
    if (!claims || !claims.sub) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const userId = claims.sub;
    const expiresIn = parseInt(process.env.WS_TOKEN_EXPIRES_IN || '3600', 10);
    const wsToken = signJwt({ sub: `USER#${userId}`, type: 'user' }, WS_JWT_SECRET, expiresIn);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        wsUrl: WS_API_ENDPOINT,
        wsToken,
        expiresIn
      })
    };
  } catch (error) {
    console.error("Error in session:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};