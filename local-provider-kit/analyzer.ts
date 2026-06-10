#!/usr/bin/env ts-node
/**
 * Local Ingestion & Message Analysis Kit
 *
 * Herramienta CLI para capturar mensajes upstream de proveedores Live Games,
 * inspeccionar dumps y sugerir mapeos hacia LiveGamesTablePatch.
 *
 * Uso:
 *   npm run analyze -- --provider pragmatic --mode ws
 *   npm run analyze -- --mode file --input ./samples/evolution-state.json
 *   npm run analyze -- --mode inspect --input ./local-provider-kit/dumps/pragmatic-20260610.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AnalyzerMode = 'ws' | 'file' | 'folder' | 'inspect';
type AnalyzerProtocol = 'websocket' | 'file' | 'folder';

interface KitConfig {
  provider: string;
  upstreamUrl?: string;
  protocol: AnalyzerProtocol;
  headers?: Record<string, string>;
  handshakeMessage?: unknown;
  outputDir: string;
  inputPath?: string;
}

interface CliArgs {
  provider?: string;
  mode?: AnalyzerMode;
  config: string;
  input?: string;
  url?: string;
}

interface FieldHeuristic {
  target: string;
  candidates: string[];
  notes?: string;
}

interface KeyStat {
  path: string;
  types: Set<string>;
  sampleValues: unknown[];
  count: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const LOG_PREFIX = '[AnalyzeKit]';

const LIVE_GAMES_FIELD_HEURISTICS: FieldHeuristic[] = [
  {
    target: 'external_id',
    candidates: [
      'tableId',
      'table_id',
      'id',
      'externalId',
      'external_id',
      'ca_table_id',
      'table.id',
      'args.tableId',
    ],
    notes: 'ID de cruce con Calímaco (sin prefijo de proveedor en prod).',
  },
  {
    target: 'idProveedor',
    candidates: ['idProveedor', 'providerId', 'provider_id'],
    notes: 'Asignar desde env: EVOLUTION=1, PRAGMATIC=2, PLAYTECH=3, EZUGI=4.',
  },
  {
    target: 'realtime.minBet',
    candidates: [
      'minBet',
      'min_bet',
      'tableLimits.minBet',
      'limits.minBet',
      'tableLimits.min',
      'betLimits.min',
      'stake.min',
    ],
  },
  {
    target: 'realtime.currency',
    candidates: ['currency', 'currencyCode', 'curr', 'tableLimits.currency'],
  },
  {
    target: 'realtime.availableSeats',
    candidates: [
      'availableSeats',
      'free_seats',
      'freeSeats',
      'seats_available',
      'seats.free',
      'args.availableSeats',
    ],
    notes: 'Solo Blackjack clásico (no OneBJ, Ruleta, Baccarat).',
  },
  {
    target: 'realtime.isAvailable',
    candidates: [
      'tableOpen',
      'isOpen',
      'isAvailable',
      'open',
      'status',
      'table.open',
      'args.tableOpen',
    ],
    notes: 'Normalizar status string ("open"/"closed") a boolean.',
  },
  {
    target: 'realtime.updatedAt',
    candidates: ['updatedAt', 'timestamp', 'time', 'lastUpdate', 'updated_at'],
    notes: 'Generar en el adapter si no viene del proveedor: new Date().toISOString().',
  },
];

const PROVIDER_ID_HINTS: Record<string, number> = {
  evolution: 1,
  pragmatic: 2,
  playtech: 3,
  ezugi: 4,
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    config: path.resolve(__dirname, 'config.json'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--provider':
        if (next) args.provider = next;
        i++;
        break;
      case '--mode':
        if (next) args.mode = next as AnalyzerMode;
        i++;
        break;
      case '--config':
        if (next) args.config = path.resolve(next);
        i++;
        break;
      case '--input':
        if (next) args.input = path.resolve(next);
        i++;
        break;
      case '--url':
        if (next) args.url = next;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
${LOG_PREFIX} Local Ingestion & Message Analysis Kit

Uso:
  npm run analyze -- [opciones]

Opciones:
  --provider <nombre>   Proveedor (evolution, pragmatic, playtech, ezugi)
  --mode <modo>         ws | file | folder | inspect
  --config <ruta>       Ruta a config.json (default: local-provider-kit/config.json)
  --input <ruta>        Archivo o carpeta (modos file, folder, inspect)
  --url <wss-url>       Sobrescribe upstreamUrl del config
  --help, -h            Muestra esta ayuda

Modos:
  ws       Conecta al WebSocket upstream y guarda mensajes en dumps/*.jsonl
  file     Analiza un archivo JSON y muestra estadísticas de estructura
  folder   Analiza todos los .json/.jsonl de una carpeta
  inspect  Sugiere mapeo heurístico hacia LiveGamesTablePatch
`);
}

// ─── Config ──────────────────────────────────────────────────────────────────

function defaultConfig(): KitConfig {
  return {
    provider: 'unknown',
    protocol: 'websocket',
    headers: {},
    outputDir: path.resolve(__dirname, 'dumps'),
  };
}

function loadConfig(configPath: string, required: boolean): KitConfig {
  if (!fs.existsSync(configPath)) {
    if (required) {
      console.error(
        `${LOG_PREFIX} No se encontró ${configPath}. Copia config.example.json → config.json y edita tus credenciales.`
      );
      process.exit(1);
    }
    console.warn(
      `${LOG_PREFIX} Sin config.json — usando valores por defecto. Para modo ws: cp config.example.json config.json`
    );
    return defaultConfig();
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<KitConfig>;

  return {
    provider: raw.provider ?? 'unknown',
    upstreamUrl: raw.upstreamUrl,
    protocol: raw.protocol ?? 'websocket',
    headers: raw.headers ?? {},
    handshakeMessage: raw.handshakeMessage,
    outputDir: raw.outputDir ?? path.resolve(__dirname, 'dumps'),
    inputPath: raw.inputPath,
  };
}

function resolveMode(cli: CliArgs, config: KitConfig): AnalyzerMode {
  if (cli.mode) return cli.mode;

  switch (config.protocol) {
    case 'file':
      return 'file';
    case 'folder':
      return 'folder';
    case 'websocket':
    default:
      return 'ws';
  }
}

// ─── Utilidades JSON ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function collectJsonObjectsFromFile(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  if (filePath.endsWith('.jsonl')) {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          console.warn(`${LOG_PREFIX} Línea ${idx + 1} inválida en ${filePath}, omitida.`);
          return null;
        }
      })
      .filter((obj): obj is unknown => obj !== null);
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    console.error(`${LOG_PREFIX} No se pudo parsear JSON: ${filePath}`);
    return [];
  }
}

function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function collectKeyStats(obj: unknown, prefix = '', stats = new Map<string, KeyStat>()): Map<string, KeyStat> {
  if (obj === null || obj === undefined) return stats;

  if (Array.isArray(obj)) {
    const arrayPath = prefix ? `${prefix}[]` : '[]';
    const entry = stats.get(arrayPath) ?? {
      path: arrayPath,
      types: new Set<string>(),
      sampleValues: [],
      count: 0,
    };
    entry.types.add('array');
    entry.count++;
    if (entry.sampleValues.length < 3) entry.sampleValues.push(`length=${obj.length}`);
    stats.set(arrayPath, entry);

    for (const item of obj.slice(0, 5)) {
      collectKeyStats(item, arrayPath, stats);
    }
    return stats;
  }

  if (typeof obj !== 'object') {
    const scalarPath = prefix || '(root)';
    const entry = stats.get(scalarPath) ?? {
      path: scalarPath,
      types: new Set<string>(),
      sampleValues: [],
      count: 0,
    };
    entry.types.add(getValueType(obj));
    entry.count++;
    if (entry.sampleValues.length < 3) entry.sampleValues.push(obj);
    stats.set(scalarPath, entry);
    return stats;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const entry = stats.get(fullPath) ?? {
      path: fullPath,
      types: new Set<string>(),
      sampleValues: [],
      count: 0,
    };
    entry.types.add(getValueType(value));
    entry.count++;
    if (entry.sampleValues.length < 3) entry.sampleValues.push(value);
    stats.set(fullPath, entry);

    if (value !== null && typeof value === 'object') {
      collectKeyStats(value, fullPath, stats);
    }
  }

  return stats;
}

function flattenPaths(obj: unknown, prefix = ''): string[] {
  const paths: string[] = [];

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(obj)) {
    const arrayPath = prefix ? `${prefix}[]` : '[]';
    paths.push(arrayPath);
    for (const item of obj.slice(0, 3)) {
      paths.push(...flattenPaths(item, arrayPath));
    }
    return paths;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.push(fullPath);
    if (value !== null && typeof value === 'object') {
      paths.push(...flattenPaths(value, fullPath));
    }
  }

  return paths;
}

function getNestedValue(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─── Modo WebSocket ──────────────────────────────────────────────────────────

async function runWebSocketMode(config: KitConfig, cli: CliArgs): Promise<void> {
  const url = cli.url ?? config.upstreamUrl;
  if (!url) {
    console.error(`${LOG_PREFIX} upstreamUrl requerido. Define en config.json o usa --url.`);
    process.exit(1);
  }

  ensureDir(config.outputDir);
  const dumpFile = path.join(
    config.outputDir,
    `${config.provider}-${timestampForFilename()}.jsonl`
  );
  const writeStream = fs.createWriteStream(dumpFile, { flags: 'a' });
  let messageCount = 0;
  let shuttingDown = false;

  console.log(`${LOG_PREFIX} Conectando a ${url}`);
  console.log(`${LOG_PREFIX} Volcado → ${dumpFile}`);
  console.log(`${LOG_PREFIX} Presiona Ctrl+C para detener con cierre limpio.\n`);

  const ws = new WebSocket(url, { headers: config.headers });

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${LOG_PREFIX} ${signal} recibido — cerrando conexión...`);

    writeStream.end(() => {
      console.log(`${LOG_PREFIX} Dump guardado: ${dumpFile} (${messageCount} mensajes)`);
      process.exit(0);
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Analyzer graceful shutdown');
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    } else {
      process.exit(0);
    }

    setTimeout(() => process.exit(0), 3000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  ws.on('open', () => {
    console.log(`${LOG_PREFIX} Conexión establecida.`);

    if (config.handshakeMessage !== undefined) {
      const payload = JSON.stringify(config.handshakeMessage);
      ws.send(payload);
      console.log(`${LOG_PREFIX} Handshake enviado (${payload.length} bytes).`);
    }
  });

  ws.on('message', (data: WebSocket.Data) => {
    const raw = data.toString();
    const line = JSON.stringify({
      capturedAt: new Date().toISOString(),
      provider: config.provider,
      raw,
    });
    writeStream.write(line + '\n');
    messageCount++;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const id =
        parsed.tableId ?? parsed.table_id ?? parsed.id ?? parsed.type ?? '(sin id)';
      console.log(`${LOG_PREFIX} #${messageCount} ← ${String(id)}`);
    } catch {
      console.log(`${LOG_PREFIX} #${messageCount} ← (no-JSON, ${raw.length} bytes)`);
    }
  });

  ws.on('ping', () => {
    if (ws.readyState === WebSocket.OPEN) ws.pong();
  });

  ws.on('error', (err: Error) => {
    console.error(`${LOG_PREFIX} Error WebSocket: ${err.message}`);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    if (!shuttingDown) {
      console.log(`${LOG_PREFIX} Conexión cerrada: code=${code} reason=${reason.toString() || '(vacío)'}`);
      writeStream.end();
      process.exit(code === 1000 ? 0 : 1);
    }
  });
}

// ─── Modo file / folder ──────────────────────────────────────────────────────

function analyzeStructure(objects: unknown[], sourceLabel: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${LOG_PREFIX} Estructura: ${sourceLabel}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Objetos analizados: ${objects.length}`);

  if (objects.length === 0) {
    console.log('  (sin datos)');
    return;
  }

  const mergedStats = new Map<string, KeyStat>();

  for (const obj of objects) {
    const objStats = collectKeyStats(obj);
    for (const [key, stat] of objStats) {
      const existing = mergedStats.get(key) ?? {
        path: key,
        types: new Set<string>(),
        sampleValues: [],
        count: 0,
      };
      for (const t of stat.types) existing.types.add(t);
      existing.count += stat.count;
      for (const sample of stat.sampleValues) {
        if (existing.sampleValues.length < 3) existing.sampleValues.push(sample);
      }
      mergedStats.set(key, existing);
    }
  }

  const sorted = [...mergedStats.values()].sort((a, b) => a.path.localeCompare(b.path));

  console.log(`  Campos únicos: ${sorted.length}\n`);
  console.log('  Ruta                          Tipos           Muestra');
  console.log('  ' + '─'.repeat(56));

  for (const stat of sorted.slice(0, 40)) {
    const types = [...stat.types].join('|');
    const sample = stat.sampleValues
      .map((v) => {
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.length > 24 ? s.slice(0, 21) + '...' : s;
      })
      .join(', ');
    console.log(
      `  ${stat.path.padEnd(30)} ${types.padEnd(15)} ${sample}`
    );
  }

  if (sorted.length > 40) {
    console.log(`  ... y ${sorted.length - 40} campos más`);
  }
}

function runFileMode(inputPath: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`${LOG_PREFIX} Archivo no encontrado: ${inputPath}`);
    process.exit(1);
  }

  const objects = collectJsonObjectsFromFile(inputPath);
  analyzeStructure(objects, inputPath);
}

function runFolderMode(inputPath: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`${LOG_PREFIX} Carpeta no encontrada: ${inputPath}`);
    process.exit(1);
  }

  const entries = fs
    .readdirSync(inputPath)
    .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'))
    .map((f) => path.join(inputPath, f));

  if (entries.length === 0) {
    console.error(`${LOG_PREFIX} No hay archivos .json/.jsonl en: ${inputPath}`);
    process.exit(1);
  }

  console.log(`${LOG_PREFIX} Analizando ${entries.length} archivo(s) en ${inputPath}`);

  for (const file of entries) {
    const objects = collectJsonObjectsFromFile(file);
    analyzeStructure(objects, path.basename(file));
  }
}

// ─── Modo inspect ────────────────────────────────────────────────────────────

function scorePathMatch(candidate: string, actualPath: string): number {
  const c = candidate.toLowerCase();
  const a = actualPath.toLowerCase();

  if (a === c) return 100;
  if (a.endsWith('.' + c)) return 90;
  if (a.endsWith(c)) return 80;
  if (a.includes(c)) return 60;
  return 0;
}

function suggestMappings(objects: unknown[], provider: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${LOG_PREFIX} Mapeo heurístico → LiveGamesTablePatch`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Proveedor: ${provider}`);
  console.log(`  idProveedor sugerido: ${PROVIDER_ID_HINTS[provider.toLowerCase()] ?? '(configurar manualmente)'}`);
  console.log(`  Mensajes de muestra: ${objects.length}\n`);

  if (objects.length === 0) {
    console.log('  Sin mensajes para analizar.');
    return;
  }

  const sampleObjects = objects.slice(0, 20).map((obj) => {
    if (obj !== null && typeof obj === 'object' && 'raw' in (obj as Record<string, unknown>)) {
      try {
        return JSON.parse((obj as Record<string, string>).raw) as unknown;
      } catch {
        return obj;
      }
    }
    return obj;
  });

  const allPaths = new Set<string>();
  for (const obj of sampleObjects) {
    for (const p of flattenPaths(obj)) allPaths.add(p);
  }

  console.log('  Campo LiveGamesTablePatch     Origen sugerido              Confianza  Notas');
  console.log('  ' + '─'.repeat(72));

  for (const heuristic of LIVE_GAMES_FIELD_HEURISTICS) {
    let bestPath = '';
    let bestScore = 0;

    for (const candidate of heuristic.candidates) {
      for (const actualPath of allPaths) {
        const score = scorePathMatch(candidate, actualPath);
        if (score > bestScore) {
          bestScore = score;
          bestPath = actualPath;
        }
      }
    }

    const confidence =
      bestScore >= 90 ? 'alta' : bestScore >= 60 ? 'media' : bestScore > 0 ? 'baja' : '—';
    const origin = bestPath || '(no detectado)';
    const notes = heuristic.notes ?? '';

    console.log(
      `  ${heuristic.target.padEnd(30)} ${origin.padEnd(28)} ${confidence.padEnd(10)} ${notes}`
    );

    if (bestPath && sampleObjects.length > 0) {
      const sampleValue = getNestedValue(sampleObjects[0], bestPath);
      if (sampleValue !== undefined) {
        const display =
          typeof sampleValue === 'object'
            ? JSON.stringify(sampleValue).slice(0, 60)
            : String(sampleValue);
        console.log(`  ${''.padEnd(30)} ejemplo: ${display}`);
      }
    }
  }

  const eventTypes = new Set<string>();
  for (const obj of sampleObjects) {
    if (obj !== null && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      const type = record.type ?? record.event ?? record.eventType ?? record.action;
      if (type !== undefined) eventTypes.add(String(type));
    }
  }

  if (eventTypes.size > 0) {
    console.log(`\n  Tipos de evento detectados: ${[...eventTypes].join(', ')}`);
  }

  console.log(`\n  Próximo paso: documentar mapeo en diagnostic/providers/${provider}/README.md`);
  console.log(`  y crear ${capitalize(provider)}IngestService.ts fuera de este kit.`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function runInspectMode(inputPath: string, provider: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`${LOG_PREFIX} Archivo no encontrado: ${inputPath}`);
    process.exit(1);
  }

  const objects = collectJsonObjectsFromFile(inputPath);
  suggestMappings(objects, provider);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  const preliminaryMode = cli.mode ?? 'ws';
  const configRequired = preliminaryMode === 'ws';
  const config = loadConfig(cli.config, configRequired);

  if (cli.provider) config.provider = cli.provider;
  if (cli.url) config.upstreamUrl = cli.url;

  const mode = resolveMode(cli, config);
  const inputPath = cli.input ?? config.inputPath;

  console.log(`${LOG_PREFIX} Proveedor: ${config.provider} | Modo: ${mode}`);

  switch (mode) {
    case 'ws':
      await runWebSocketMode(config, cli);
      break;
    case 'file':
      if (!inputPath) {
        console.error(`${LOG_PREFIX} --input requerido para modo file.`);
        process.exit(1);
      }
      runFileMode(inputPath);
      break;
    case 'folder':
      if (!inputPath) {
        console.error(`${LOG_PREFIX} --input requerido para modo folder.`);
        process.exit(1);
      }
      runFolderMode(inputPath);
      break;
    case 'inspect':
      if (!inputPath) {
        console.error(`${LOG_PREFIX} --input requerido para modo inspect.`);
        process.exit(1);
      }
      runInspectMode(inputPath, config.provider);
      break;
    default:
      console.error(`${LOG_PREFIX} Modo desconocido: ${mode}`);
      process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error(`${LOG_PREFIX} Error fatal: ${err.message}`);
  process.exit(1);
});
