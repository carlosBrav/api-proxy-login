const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 8081;
// Permitir configurar la URL del WS por variable de entorno para Render
const WS_URL = process.env.WS_URL || "ws://localhost:8081";
const EXPIRES_IN = parseInt(process.env.WS_TOKEN_EXPIRES_IN || "3600", 10);

// Helper para crear Base64Url estricto (alfanumérico + '-' y '_')
const toBase64Url = (str) => {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

function isJwtFormat(token) {
  const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

  return jwtRegex.test(token);
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // MOCK: POST /ws/guest-session
  if (req.method === "POST" && req.url === "/ws/guest-session") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      let guestId = "us-east-1:local-dummy-uuid";
      if (body) {
        try {
          
          const parsed = JSON.parse(body);
          if (Object.keys(parsed).length > 0) {
            if (!parsed.guestId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ error: "Unauthorized: Missing guestId" }),
              );
              return;
            }
            if (!parsed.guestId.toString().trim() || parsed.guestId.length === 0) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Unauthorized: Missing or invalid guestId",
                }),
              );
              return;
            }
            if (!parsed.guestId.toString().trim().includes("us-east-")) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Unauthorized: Missing or invalid guestId",
                }),
              );
              return;
            }
            if (parsed.guestId) guestId = parsed.guestId;
          }
        } catch (e) {
          console.error("Error parsing body", e);
        }
      }

      const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = toBase64Url(
        JSON.stringify({
          sub: "GUEST#" + guestId,
          type: "guest",
          exp: Math.floor(Date.now() / 1000) + EXPIRES_IN,
        }),
      );
      const signature = crypto
        .createHmac("sha256", "local-secret-key")
        .update(header + "." + payload)
        .digest("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
      const wsToken = header + "." + payload + "." + signature;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          guestId: guestId,
          wsUrl: WS_URL,
          wsToken: wsToken,
          expiresIn: EXPIRES_IN,
        }),
      );
    });
  }
  // MOCK: POST /ws/session
  else if (req.method === "POST" && req.url === "/ws/session") {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Unauthorized: Missing or invalid token" }),
      );
      return;
    }

    const token = authHeader.split(" ")[1];
    if (token.split(".").length !== 3 || !isJwtFormat(token)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: Invalid JWT format" }));
      return;
    }

    const mockUserId = "0881e330-d021-7082-4bca-3533c484c4e5";

    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = toBase64Url(
      JSON.stringify({
        sub: "USER#" + mockUserId,
        type: "user",
        exp: Math.floor(Date.now() / 1000) + EXPIRES_IN,
      }),
    );
    const signature = crypto
      .createHmac("sha256", "local-secret-key")
      .update(header + "." + payload)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const wsToken = header + "." + payload + "." + signature;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        wsUrl: WS_URL,
        wsToken: wsToken,
        expiresIn: EXPIRES_IN,
      }),
    );
  }
  // MOCK: POST /login
  else if (req.method === "POST" && req.url === "/login") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ idToken: "mock_id_token_jwt", expiresIn: 3600 }));
  }
  // MOCK: GET /data/validate-session
  else if (req.method === "GET" && req.url === "/data/validate-session") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ valid: true, user: "dev-user@acity.com" }));
  }
  // 404
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});
