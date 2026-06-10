# Local Ingestion & Message Analysis Kit

Kit de análisis local para capturar, inspeccionar y mapear mensajes crudos de proveedores Live Games hacia el contrato canónico `LiveGamesTablePatch`.

> **Seguridad:** Nunca commitees `config.json` ni archivos en `dumps/`. Solo se versionan plantillas sin secretos.

---

## 1. Configuración inicial

```bash
# Desde la raíz del repo bff-mv-streaming-col
cp local-provider-kit/config.example.json local-provider-kit/config.json
```

Edita `config.json` con tus credenciales locales (casinoId, headers Basic auth, tableIds, etc.).

| Campo | Descripción |
|-------|-------------|
| `provider` | Nombre del proveedor: `evolution`, `pragmatic`, `playtech`, `ezugi` |
| `upstreamUrl` | URL WSS upstream (ej. `wss://dga.pragmaticplaylive.net/ws`) |
| `protocol` | `websocket` (default), `file` o `folder` |
| `headers` | Headers HTTP opcionales (Basic auth Evolution, etc.) |
| `handshakeMessage` | JSON enviado tras conectar (subscribe Pragmatic DGA) |
| `outputDir` | Carpeta de volcados (default: `./local-provider-kit/dumps`) |
| `inputPath` | Ruta por defecto para modos file/folder/inspect |

---

## 2. Captura WebSocket (modo `ws`)

Ideal para **Pragmatic DGA** o **Evolution Lobby Streaming**.

```bash
# Usando config.json
npm run analyze -- --provider pragmatic --mode ws

# Sobrescribir URL desde CLI
npm run analyze -- --provider evolution --mode ws --url wss://tu-host/api/lobby/v1/...

# Config personalizado
npm run analyze -- --config ./local-provider-kit/config.json --mode ws
```

**Qué hace:**
1. Conecta al WebSocket upstream con los `headers` del config.
2. Envía `handshakeMessage` si está definido (ej. subscribe Pragmatic).
3. Guarda cada mensaje en `dumps/{provider}-{timestamp}.jsonl`.
4. `Ctrl+C` cierra la conexión limpiamente (código 1000).

**Ejemplo Pragmatic DGA** — `handshakeMessage` en config:

```json
{
  "type": "subscribe",
  "isDeltaEnabled": true,
  "casinoId": "TU_CASINO_ID",
  "currency": "COP",
  "key": ["301", "402", "1301"]
}
```

**Ejemplo Evolution** — `headers` en config:

```json
{
  "headers": {
    "Authorization": "Basic BASE64_USER_PASS"
  }
}
```

---

## 3. Análisis de archivos JSON (modo `file` / `folder`)

Para muestras entregadas por terceros o exports REST.

```bash
# Un archivo
npm run analyze -- --mode file --input ./samples/evolution-state.json

# Carpeta con varios JSON/JSONL
npm run analyze -- --mode folder --input ./samples/pragmatic-dumps/
```

Muestra estadísticas de campos: rutas, tipos y valores de muestra.

---

## 4. Inspección y mapeo (modo `inspect`)

Sugiere campos mapeables hacia `LiveGamesTablePatch`:

```bash
npm run analyze -- --mode inspect --input ./local-provider-kit/dumps/pragmatic-2026-06-10T12-00-00.jsonl
```

Campos objetivo del contrato canónico:

| Campo | Uso |
|-------|-----|
| `external_id` | ID de cruce Calímaco (sin prefijo proveedor en prod) |
| `idProveedor` | 1=Evolution, 2=Pragmatic, 3=Playtech, 4=Ezugi |
| `realtime.minBet` | Límite mínimo de apuesta |
| `realtime.currency` | Moneda ISO (COP, USD…) |
| `realtime.availableSeats` | Solo Blackjack clásico (0–7) |
| `realtime.isAvailable` | Mesa abierta para apuestas |
| `realtime.updatedAt` | Timestamp ISO-8601 (generar en adapter si falta) |

---

## 5. Flujo post-captura → adapter real

```
analyzer.ts captura dump
  → identificar tableId / event type en JSON crudo
  → documentar mapeo en diagnostic/providers/{proveedor}/README.md
  → implementar {Proveedor}IngestService.ts (fuera de este kit)
  → reutilizar adapter en src/providers/
  → conectar en index.ts cuando MOCK_PROVIDERS=false
```

---

## 6. Referencias

- Pragmatic DGA: `diagnostic/providers/pragmatic/README.md`
- Evolution & Ezugi: `diagnostic/providers/evolution/README.md`
- Playtech Kafka: `diagnostic/providers/playtech/README.md` (fase 2 del kit)
- Contrato canónico: `src/domain/LiveGamesTablePatch.ts`
- Plan de implementación: `diagnostic/AG-IMPLEMENTATION-PLAN.md` (sección Local Kit)

---

## 7. Solución de problemas

| Problema | Acción |
|----------|--------|
| `config.json` no encontrado | Copiar desde `config.example.json` |
| Conexión rechazada (Pragmatic) | Verificar IP allowlist con el proveedor |
| Evolution 401 | Revisar header `Authorization: Basic …` |
| Dump vacío | Confirmar handshake y tableIds en subscribe |
| `npm run analyze` falla | Ejecutar desde raíz del repo con `npm install` previo |
