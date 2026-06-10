# Datos mock vs catálogo en desarrollo

Guía para entender qué es **simulado** y qué viene del **catálogo DynamoDB** cuando corres el BFF en local con `MOCK_PROVIDERS=true`.

## Resumen en una frase

En dev, los **valores en tiempo real** (minBet, asientos, disponibilidad) son **aleatorios y mock**; **qué mesas pueden aparecer** lo decide el **filtro de catálogo** según los `ca_table_id` ingeridos desde Calímaco (`getLobby`).

## Flujo en desarrollo (`MOCK_PROVIDERS=true`)

```
MockPatchGenerator (cada ~3s)
  → genera eventos crudos por proveedor (Evolution, Pragmatic, Playtech, Ezugi)
  → Adapters.adapt() → LiveGamesTablePatch
  → CatalogFilterService (DynamoDB)
  → LiveGamesStore → FanOut → WSS / REST poll
```

### Qué es mock

| Aspecto | Origen en dev |
|--------|----------------|
| `minBet`, `availableSeats`, `isAvailable` | Números/booleanos **aleatorios** en `MockPatchGenerator` |
| Forma del parche | **Adapters** por proveedor (misma estructura que prod) |
| Moneda (`currency`) | `MOCK_CURRENCY` (default **PEN**). Antes era `COP` fijo — placeholder, no refleja Calímaco |
| Frecuencia | Nuevo lote de parches cada **~3 segundos** |

Los valores **cambian** en cada tick; no son estáticos. Si ves el mismo `external_id` varias veces, los campos `realtime` pueden diferir.

### Qué viene del catálogo (DynamoDB)

| Aspecto | Origen |
|--------|--------|
| **Qué `external_id` / `ca_table_id` pueden emitirse** | Set en memoria cargado desde DynamoDB |
| PK por lobby | `LOBBY#ACP#livepoker`, `LOBBY#ACP#liveblackjack`, etc. |
| Población del catálogo | Lambda `lambda-ingest-lobby` → `POST getLobby` Calímaco → `PutItem` |

**DynamoDB no transmite valores en vivo al WSS.** Solo autoriza qué mesas existen en el lobby de Calímaco para ese entorno. Si un `ca_table_id` no está en el catálogo, el mock **no generará parches** para esa mesa (lista vacía para ese proveedor en ese ciclo).

### `external_id` en parches

En mock, `external_id` = `ca_table_id` de Calímaco **sin prefijo de proveedor** (ej. `2601`, `THBTable00000001`, `ez_1_00000000000`).

La lista de mesas mock en código (`MOCK_TABLES`) debe alinearse con los IDs reales del lobby ingerido. Si ingestas `liveblackjack`, necesitas que Ezugi use `ez_1_00000000000` (no IDs inventados como `ez-bj-001`).

## Por qué aparecía COP

`COP` estaba **hardcodeado** en `MockPatchGenerator` y adapters como moneda de placeholder. No viene de Calímaco ni del proveedor en modo mock.

- **Producción:** la moneda debe salir del payload del proveedor o de Calímaco (Perú → típicamente **PEN**).
- **Dev:** usa `MOCK_CURRENCY=PEN` en `.env.local` (default del BFF).

## Lobbies múltiples (livepoker + liveblackjack)

El catálogo DynamoDB puede tener **varias particiones** (un PK por lobby):

| Lobby | PK ejemplo | Contenido típico |
|-------|------------|------------------|
| `livepoker` | `LOBBY#ACP#livepoker` | Evolution, Pragmatic, Playtech (póker) |
| `liveblackjack` | `LOBBY#ACP#liveblackjack` | Blackjack; **Ezugi** vía `sub_provider=ezugi2` (`ez_1_00000000000`) |

### Ingesta

```bash
cd lambda-ingest-lobby

# Solo blackjack (Ezugi)
INGEST_LOBBY=liveblackjack npm run invoke:local

# Solo póker
INGEST_LOBBY=livepoker npm run invoke:local

# Ambos en una corrida
INGEST_LOBBIES=livepoker,liveblackjack npm run invoke:local:all
```

### BFF — filtro multi-lobby

Por defecto el BFF consulta **solo** `INGEST_LOBBY` (un PK). Para autorizar mesas de ambos lobbies:

```env
CATALOG_LOBBIES=livepoker,liveblackjack
```

`catalogRefresh` hace **Query** por cada PK y hace **unión** de todos los `ca_table_id`.

## Verificación rápida

1. Ingesta: `INGEST_LOBBY=liveblackjack npm run invoke:local` en `lambda-ingest-lobby/`.
2. BFF `.env.local`: `CATALOG_LOBBIES=livepoker,liveblackjack` (o solo `liveblackjack` si solo probás Ezugi).
3. Arranca BFF → consola: `[CatalogFilter] Refrescado: N mesas autorizadas` con N > 0.
4. Poll (tras ~3s): `curl "http://localhost:8080/api/v1/live-games/realtime?externalIds=ez_1_00000000000"`

## Preguntas frecuentes

**¿Por qué el WSS no muestra datos “reales” de las mesas?**  
Porque en dev no hay conectores Kafka/API de proveedores; solo mocks periódicos filtrados por catálogo.

**¿Por qué a veces no veo parches de un proveedor?**  
Ninguna mesa de ese proveedor en `MOCK_TABLES` coincide con un `ca_table_id` autorizado en DynamoDB.

**¿Tengo que re-ingestar si cambia el lobby en Calímaco?**  
Sí, para que el catálogo refleje mesas nuevas o eliminadas. El BFF refresca el set en memoria cada hora (`CATALOG_REFRESH_INTERVAL_MS`) o al reiniciar.

**¿Ezugi está en livepoker?**  
No en la respuesta actual de Calímaco; la mesa Ezugi (`ez_1_00000000000`, `sub_provider: ezugi2`) aparece en **`liveblackjack`**.
