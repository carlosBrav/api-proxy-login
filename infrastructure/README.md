# Infraestructura — bff-mv-streaming-col

Terraform para el BFF Live Games: entorno local (Floci) y, en fases posteriores, dev/prod en AWS.

## Paso 1 — DynamoDB catálogo local

Tabla `col_maestro_transversal_juegos` con claves compuestas `pk` (HASH) y `sk` (RANGE), modo `PAY_PER_REQUEST`.

| Clave | Ejemplo | Descripción |
|-------|---------|-------------|
| `pk` | `LOBBY#ACP#livepoker` | Partición por company + lobby |
| `sk` | `TABLE#vs10bookoftut` | Un ítem por mesa (`ca_table_id`) |

### Prerrequisitos

- Docker Desktop en ejecución
- [Floci](https://github.com/floci/floci) vía `docker/docker-compose.yml`
- Perfil AWS local (`~/.aws/credentials`):

  ```ini
  [local]
  aws_access_key_id = test
  aws_secret_access_key = test
  ```

- Terraform >= 1.5
- Node.js >= 20 (para compilar la Lambda en Paso 2)

### Comandos Paso 1

```bash
# 1. Levantar emulador AWS local
cd docker && docker compose up -d

# 2. Aplicar solo la tabla DynamoDB (o todo el stack local)
cd ../infrastructure/environments/local
terraform init
terraform apply

# 3. Verificar tabla
aws dynamodb list-tables \
  --endpoint-url http://localhost:4566 \
  --profile local

aws dynamodb describe-table \
  --table-name col_maestro_transversal_juegos \
  --endpoint-url http://localhost:4566 \
  --profile local
```

### Outputs Paso 1

| Output | Descripción |
|--------|-------------|
| `catalog_table_name` | `col_maestro_transversal_juegos` |
| `dynamodb_endpoint` | `http://localhost:4566` |

---

## Paso 2 — Lambda ingest + EventBridge (local)

Lambda `lambda-ingest-lobby` que:

1. Llama `POST getLobby` a Calímaco (`company`, `lobby`, `limits`, `filter`).
2. Mapea `lobby[]` a campos `ca_*` (incluye `ca_game_type` desde tags `cl_live_*`).
3. Hace upsert idempotente en DynamoDB (`BatchWriteItem` / `PutItem`).
4. Se ejecuta cada hora vía EventBridge `rate(1 hour)`.

### Compilar artefacto Lambda

```bash
cd lambda-ingest-lobby
npm install
npm run build:lambda
```

El zip para Terraform se genera automáticamente en `terraform apply` desde `lambda-ingest-lobby/dist/`.

### Comandos Paso 2

```bash
# 1. Floci en ejecución
cd docker && docker compose up -d

# 2. Build + infra (compila Lambda y crea zip)
cd ../infrastructure/environments/local
terraform init
terraform apply

# 3. Invocación manual de la Lambda
aws lambda invoke \
  --function-name lambda-ingest-lobby \
  --endpoint-url http://localhost:4566 \
  --profile local \
  --payload '{}' \
  /tmp/ingest-response.json

cat /tmp/ingest-response.json

# 4. Verificar ítems en DynamoDB
aws dynamodb scan \
  --table-name col_maestro_transversal_juegos \
  --endpoint-url http://localhost:4566 \
  --profile local
```

### Variables de entorno Lambda (Terraform)

| Variable | Valor local | Descripción |
|----------|-------------|-------------|
| `INGEST_COMPANY` | `ACP` | Parámetro `company` getLobby |
| `INGEST_LOBBY` | `livepoker` | Parámetro `lobby` getLobby |
| `CATALOG_TABLE_NAME` | `col_maestro_transversal_juegos` | Tabla destino |
| `GET_LOBBY_URL` | URL Calímaco | Endpoint getLobby |
| `DYNAMODB_ENDPOINT` | `http://host.docker.internal:4566` | DynamoDB desde contenedor Lambda |

### Outputs Paso 2

| Output | Descripción |
|--------|-------------|
| `lambda_function_name` | `lambda-ingest-lobby` |
| `lambda_event_rule_name` | `ingest-lobby-hourly` |

### Notas Floci / Lambda

- La Lambda necesita salida HTTPS hacia `api.casinoatlanticcity.com` para getLobby real.
- Si Floci no expone EventBridge, la regla horaria puede no dispararse; usar invocación manual (`aws lambda invoke`).
- `DYNAMODB_ENDPOINT` usa `host.docker.internal` para que el contenedor Lambda alcance Floci en el host.

---

## Paso 3 — Integración BFF con catálogo (pendiente)

Objetivo: `CatalogFilterService` lee `ca_table_id` desde DynamoDB.

Tareas:

1. Env `CATALOG_TABLE_NAME` en el BFF.
2. `catalogRefresh.ts`: Query/Scan por `LOBBY#{company}#{lobby}` al arranque y cada hora.
3. Cache en memoria `Set<string>` de `ca_table_id` autorizados.
4. Filtrar parches en `IngestionWorker` antes de Redis/WSS.
5. Tests de integración con Floci + datos de prueba en DynamoDB.

---

## Estructura

```
infrastructure/
├── environments/
│   └── local/              # Floci — desarrollo local
├── modules/
│   ├── catalog-dynamodb/
│   └── lambda-ingest/
└── README.md
```

Entornos `dev/` y `prod/` (ECS, ECR, ElastiCache) se añadirán en fases de despliegue AWS.
