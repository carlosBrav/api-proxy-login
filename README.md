# bff-mv-streaming-col

Microservicio **Live Games Real-Time BFF** para Atlantic City Perú. Enriquece el lobby de mesas en vivo con parches en tiempo casi real (asientos, apuestas mínimas, disponibilidad) vía **REST poll** y fan-out a clientes por **API Gateway WebSocket** (no expone WSS a navegadores).

## Stack

- Node.js 20+, TypeScript strict
- Express 4 (REST)
- Redis (`ioredis`) pub/sub + snapshot hash; fallback in-process en dev
- Fan-out: `@aws-sdk/client-apigatewaymanagementapi` (`PostToConnection`) en prod; log `[FanOut:local]` en dev
- `ws` solo para conectores upstream a proveedores (futuro)
- Zod para validación de variables de entorno

Ver [docs/CAMBIO-ARQUITECTONICO-WSS-APIGW.md](docs/CAMBIO-ARQUITECTONICO-WSS-APIGW.md).

## Inicio rápido

```bash
cp .env.example .env.local
npm install
npm run dev
```

### Probar catálogo local

El filtro de catálogo se activa cuando `DYNAMODB_ENDPOINT` está definido en **`.env.local` en la raíz del BFF** (no solo en `lambda-ingest-lobby/`).

1. Levanta DynamoDB local y aplica Terraform (`infrastructure/environments/local`).
2. Puebla el catálogo desde `lambda-ingest-lobby/` (`npm run invoke:local` y/o `npm run invoke:local:blackjack` para Ezugi).
3. Copia este bloque a `.env.local` en la raíz del BFF:

```env
PORT=8080
NODE_ENV=development
MOCK_PROVIDERS=true
MOCK_AUTH_GUEST=true
REDIS_ENABLED=false
REDIS_OPTIONAL=true
CATALOG_TABLE_NAME=col_maestro_transversal_juegos
INGEST_COMPANY=ACP
INGEST_LOBBY=livepoker
# Union livepoker + liveblackjack (recomendado si ingestaste ambos):
# CATALOG_LOBBIES=livepoker,liveblackjack
MOCK_CURRENCY=PEN
DYNAMODB_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
```

Al arrancar deberías ver `📋 Catálogo: N mesas` (N > 0) y en consola `[CatalogFilter] Refrescado: N mesas autorizadas`.

Los mocks usan `ca_table_id` reales de getLobby Calímaco (`livepoker`: Evolution `THBTable00000001`, Pragmatic `2601`, etc.; `liveblackjack`: Ezugi `ez_1_00000000000`). `external_id` en parches = `ca_table_id` sin prefijo de proveedor. Ver [docs/DEV-DATOS-MOCK-VS-REAL.md](docs/DEV-DATOS-MOCK-VS-REAL.md).

El catálogo DynamoDB puede tener **varios PK** (`LOBBY#ACP#livepoker`, `LOBBY#ACP#liveblackjack`). El BFF consulta por defecto solo `INGEST_LOBBY`; usa `CATALOG_LOBBIES=livepoker,liveblackjack` para unir ambos.

Poll REST con `ca_table_id` Calímaco:

```bash
# Espera ~3s a que el mock genere parches, luego:
curl "http://localhost:8080/api/v1/live-games/realtime?externalIds=2601"
curl "http://localhost:8080/api/v1/live-games/realtime?externalIds=THBTable00000001"
```

Sin `DYNAMODB_ENDPOINT` en la raíz del BFF verás `📋 Catálogo: deshabilitado`.

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Healthcheck |
| GET | `/api/v1/live-games/realtime?externalIds=...` | Poll fallback (parches filtrados) |

El streaming WSS al browser va por **API Gateway WebSocket** (repo infra), no por este BFF.

Con `MOCK_PROVIDERS=true` (default), el servicio genera ~4 parches cada 3 segundos. En local (`IS_OFFLINE=true`) verás `[FanOut:local]` en consola simulando el envío a clientes.

### Verificación local

```bash
curl http://localhost:8080/health
curl "http://localhost:8080/api/v1/live-games/realtime?externalIds=2601"
# Fan-out simulado: observar [FanOut:local] en logs del servidor cada ~3s
```

Variables útiles en `.env.local`:

```env
IS_OFFLINE=true
USE_LOCAL_FANOUT_LOG=true
REDIS_ENABLED=false
```

## Estructura del proyecto

```
src/
├── index.ts                 # Bootstrap HTTP + FanOut Redis
├── config/env.ts            # Validación Zod
├── domain/                  # LiveGamesTablePatch, RealtimePatchMessage
├── providers/               # Adapters por proveedor (Strategy)
├── catalog/                 # CatalogFilterService
├── ingestion/               # IngestionWorker, ProviderFilter
├── pubsub/                  # Redis, LiveGamesStore, PatchPublisher, FanOutService
├── api/routes/              # REST live-games
└── health/                  # Healthcheck

infrastructure/              # Terraform (local Floci + futuro AWS)
lambda-ingest-lobby/         # Lambda ingesta catálogo getLobby
local-provider-kit/          # Captura upstream para adapters reales
docker/                      # Floci + Dockerfile ECS
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con nodemon |
| `npm run build` | Compilar a `dist/` |
| `npm run typecheck` | Verificación TypeScript |
| `npm run analyze` | Local Provider Kit (captura upstream) |
| `npm test` | Tests unitarios (node:test) |

`dev` y `start` cargan `.env.local` vía `DOTENV_CONFIG_PATH` (no pasar `dotenv_config_path` como argumento CLI).

### Hooks de Git (opcional)

Para bloquear commits con `Co-authored-by: Cursor`:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/commit-msg
```

No se configura automáticamente; cada desarrollador lo activa en su clon local.

## Infraestructura local

Ver [infrastructure/README.md](infrastructure/README.md) para DynamoDB catálogo con Floci.

```bash
cd docker && docker compose up -d
cd infrastructure/environments/local
terraform init && terraform apply
```

## Contrato de salida

El BFF emite únicamente `LiveGamesTablePatch`: `external_id`, `idProveedor` y campos `realtime.*`. No se envían metadatos estáticos (nombre, logo, proveedor).

## Proveedores

| ID | Proveedor | Estado |
|----|-----------|--------|
| 1 | Evolution | Adapter mock |
| 2 | Pragmatic | Adapter mock |
| 3 | Playtech | Adapter stub |
| 4 | Ezugi | Adapter stub |

## Documentación de referencia

Guía maestra y arquitectura de catálogo: repositorio `Analisis-mv` (documentación externa al repo).
