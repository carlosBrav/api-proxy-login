# lambda-ingest-lobby

Lambda que ingesta el catálogo de mesas live desde Calímaco (`getLobby`) hacia DynamoDB `col_maestro_transversal_juegos`.

## Sí, el código llama a getLobby

La ingesta **sí** invoca `POST https://api.casinoatlanticcity.com/api/contents/getLobby` con body `application/x-www-form-urlencoded`.

### Evidencia en código

| Archivo | Qué hace |
|---------|----------|
| `src/calimacoClient.ts` L15–20 | Resuelve URL (`GET_LOBBY_URL` o default Calímaco) |
| `src/calimacoClient.ts` L44–57 | Construye `company`, `lobby`, `limits`, `filter` y hace `fetch` POST |
| `src/handler.ts` L26 | `fetchLobbyFromCalimaco(company, lobby)` es el primer paso del handler |
| `infrastructure/environments/local/lambda.tf` L33–39 | Terraform inyecta `GET_LOBBY_URL`, `INGEST_COMPANY`, `INGEST_LOBBY` |

Body enviado (equivalente al curl manual):

```
company=ACP
lobby=livepoker
limits={"init":0,"end":25}
filter={"name":"","providers":"","tags":""}
```

Variables opcionales: `INGEST_LIMITS_INIT`, `INGEST_LIMITS_END`, `INGEST_FILTER`.

---

## Verificación paso a paso

### Paso A — Probar la API Calímaco (sin Lambda)

**Opción 1: curl**

```bash
curl -sS -X POST 'https://api.casinoatlanticcity.com/api/contents/getLobby' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'company=ACP' \
  --data-urlencode 'lobby=livepoker' \
  --data-urlencode 'limits={"init":0,"end":25}' \
  --data-urlencode 'filter={"name":"","providers":"","tags":""}' \
  | jq '{result, total_machines, lobby_count: (.lobby | length), first_external_id: .lobby[0].external_id}'
```

**Éxito esperado:** `result: "OK"`, `total_machines: 8` (valor actual), `first_external_id: "THBTable00000001"`.

**Lobby liveblackjack (Ezugi y más blackjack)**

```bash
curl -sS -X POST 'https://api.casinoatlanticcity.com/api/contents/getLobby' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'company=ACP' \
  --data-urlencode 'lobby=liveblackjack' \
  --data-urlencode 'limits={"init":0,"end":50}' \
  --data-urlencode 'filter={"name":"","providers":"","tags":""}' \
  | jq '{result, total_machines, lobby_count: (.lobby | length), ezugi: [.lobby[] | select(.sub_provider != null and (.sub_provider | test("ezugi"; "i"))) | {external_id, name, sub_provider}]}'
```

**Éxito esperado (jun 2026):** `total_machines: 15`, Ezugi con `external_id: "ez_1_00000000000"`, `sub_provider: "ezugi2"`.

**Opción 2: script TypeScript (solo getLobby, sin DynamoDB)**

```bash
cd lambda-ingest-lobby
npm install
npm run test:getLobby
```

---

### Paso B — Ejecutar el handler en local (host, no contenedor Lambda)

Requiere Floci/DynamoDB local en `localhost:4566` (ver `docker/docker-compose.yml` en la raíz del repo).

```bash
cd lambda-ingest-lobby
npm install

# 1. Copiar plantilla y editar INGEST_LOBBIES (o INGEST_LOBBY para un solo lobby)
cp .env.local.example .env.local

# 2. Levantar Floci si no está corriendo
cd ../docker && docker compose up -d && cd ../lambda-ingest-lobby

# 3. Ingesta según .env.local (DYNAMODB_ENDPOINT, credenciales test, lobbies)
npm run invoke:local

# Un solo lobby distinto sin editar .env.local (override inline; gana sobre INGEST_LOBBIES)
INGEST_LOBBY=livepoker npm run invoke:local

# Atajo blackjack
npm run invoke:local:blackjack

# Todos los lobbies listados en INGEST_LOBBIES de .env.local (mismo script, sin lista en package.json)
npm run invoke:local:all
```

**Éxito esperado en consola (un lobby):**

```json
{"status":"ok","company":"ACP","lobby":"livepoker","lobbies":[{"lobby":"livepoker","fetched":8,"mapped":8,"skipped":0,"upserted":8}],"fetched":8,"mapped":8,"skipped":0,"upserted":8}
```

**Dos lobbies (`invoke:local:all`):** `lobbies` con dos entradas; totales en `fetched`/`upserted` suman ambos.

**Verificar ítems en DynamoDB:**

```bash
aws dynamodb scan \
  --table-name col_maestro_transversal_juegos \
  --endpoint-url http://localhost:4566 \
  --profile local
```

Busca registros con `ca_table_id` (ej. `THBTable00000001`, `2601`) y `pk = LOBBY#ACP#livepoker`.

---

### Paso C — Invocar la Lambda desplegada en Floci (terraform apply)

```bash
# 1. Levantar emulador
cd docker && docker compose up -d

# 2. Desplegar infra (compila Lambda + zip)
cd ../infrastructure/environments/local
terraform init
terraform apply

# 3. Invocar Lambda en Floci
aws lambda invoke \
  --function-name lambda-ingest-lobby \
  --endpoint-url http://localhost:4566 \
  --profile local \
  --payload '{}' \
  /tmp/ingest-response.json

cat /tmp/ingest-response.json
```

**Éxito esperado:** mismo JSON que en Paso B (`status: "ok"`, `upserted: 8`).

---

## Variables de entorno

| Variable | Default local | Descripción |
|----------|---------------|-------------|
| `GET_LOBBY_URL` | `https://api.casinoatlanticcity.com/api/contents/getLobby` | Endpoint Calímaco |
| `INGEST_COMPANY` | `ACP` | Parámetro `company` |
| `INGEST_LOBBY` | `livepoker` | Parámetro `lobby` (un lobby) |
| `INGEST_LOBBIES` | — | Varios lobbies coma-separados (`livepoker,liveblackjack`). Tiene prioridad sobre `INGEST_LOBBY` |
| `INGEST_LIMITS_INIT` | `0` | Paginación `limits.init` |
| `INGEST_LIMITS_END` | `25` | Paginación `limits.end` |
| `INGEST_FILTER` | `{"name":"","providers":"","tags":""}` | Filtro JSON |
| `CATALOG_TABLE_NAME` | `col_maestro_transversal_juegos` | Tabla DynamoDB |
| `DYNAMODB_ENDPOINT` | `http://localhost:4566` en `.env.local` / `http://host.docker.internal:4566` en Floci | Endpoint DynamoDB local |
| `AWS_REGION` | `us-east-1` | Región SDK |

Terraform define estas variables en `infrastructure/environments/local/lambda.tf`.

---

## Si getLobby funciona en local pero falla en la Lambda de Floci

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Timeout o error de red al llamar Calímaco | El contenedor Lambda no tiene salida HTTPS | Verificar que Docker tenga acceso a internet; probar desde el contenedor |
| `getLobby HTTP 4xx/5xx` | URL o parámetros incorrectos | Revisar `GET_LOBBY_URL`, `INGEST_COMPANY`, `INGEST_LOBBY` en Terraform |
| `ResourceNotFoundException` DynamoDB | Endpoint incorrecto desde contenedor | Usar `DYNAMODB_ENDPOINT=http://host.docker.internal:4566` (ya configurado en Terraform local) |
| `AccessDeniedException` en host sin endpoint | SDK apunta a AWS real | Usar `npm run invoke:local` o copiar `.env.local.example` → `.env.local` |

En macOS/Windows, `host.docker.internal` permite que la Lambda dentro de Floci alcance DynamoDB en el host (`localhost:4566`).

---

## Error AccessDeniedException

Si al ejecutar el handler en tu máquina ves `AccessDeniedException` contra un ARN real de AWS (p. ej. `arn:aws:dynamodb:us-east-1:…:table/col_maestro_transversal_juegos`), **no estás usando Floci**: el SDK tomó tu perfil/credenciales AWS reales porque faltaba `DYNAMODB_ENDPOINT`.

**Qué hacer:**

1. Levanta Floci: `cd docker && docker compose up -d`
2. Usa las variables de entorno locales, **no** tu perfil AWS de producción:
   - `cp .env.local.example .env.local` (incluye `DYNAMODB_ENDPOINT` y credenciales `test`/`test`), luego `npm run invoke:local`
3. Verifica que DynamoDB local responde: `aws dynamodb list-tables --endpoint-url http://localhost:4566 --profile local`

En Lambda desplegada en AWS, no definas `DYNAMODB_ENDPOINT`; el rol IAM de la función es el mecanismo correcto.

---

## Flujo del handler

```
EventBridge (cada hora) o invoke manual
  → handler.ts
    → calimacoClient.fetchLobbyFromCalimaco()   # POST getLobby
    → fieldMapper.mapLobbyToCatalogRecords()    # ca_table_id, ca_game_type, etc.
    → catalogUpsert.upsertCatalogRecords()      # PutItem DynamoDB
```

---

## Siguiente paso recomendado

Con la ingesta verificada (API → handler local → `aws lambda invoke` en Floci), continuar con **Paso 3 — `CatalogFilterService`** en el BFF:

1. Variable `CATALOG_TABLE_NAME` en el BFF.
2. `catalogRefresh.ts`: leer `LOBBY#ACP#livepoker` al arranque y cada hora.
3. Cache en memoria (`Set<string>`) de `ca_table_id` autorizados.
4. Filtrar parches en `IngestionWorker` antes de Redis/WSS.

No avanzar al Paso 3 si la invocación en Floci sigue fallando en getLobby o DynamoDB.

---

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run build:lambda` | Bundle esbuild → `dist/handler.js` |
| `npm run test:getLobby` | Solo prueba POST getLobby |
| `npm run invoke:local` | Ejecuta handler leyendo `.env.local` (`DOTENV_CONFIG_PATH`) |
| `npm run invoke:local:blackjack` | Override `INGEST_LOBBY=liveblackjack` sobre `.env.local` |
| `npm run invoke:local:all` | Igual que `invoke:local`; requiere `INGEST_LOBBIES` en `.env.local` |
