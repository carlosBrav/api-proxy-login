import { z } from 'zod';

/**
 * Esquema Zod para la validación estricta de variables de entorno.
 * Cualquier variable faltante o con formato incorrecto lanzará un error
 * claro al arrancar el servidor, evitando fallos silenciosos en runtime.
 */
const envSchema = z.object({
  PORT: z
    .string()
    .default('8080')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  REDIS_URL: z
    .string()
    .url()
    .default('redis://localhost:6379'),

  REDIS_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  REDIS_OPTIONAL: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  MOCK_PROVIDERS: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  MOCK_AUTH_GUEST: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  ID_PROVEEDOR_REQUIRED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // --- Provider IDs ---
  EVOLUTION_PROVIDER_ID: z
    .string()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  PRAGMATIC_PROVIDER_ID: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  PLAYTECH_PROVIDER_ID: z
    .string()
    .default('3')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  EZUGI_PROVIDER_ID: z
    .string()
    .default('4')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // --- Catálogo DynamoDB (filtro ingesta) ---
  CATALOG_TABLE_NAME: z
    .string()
    .default('col_maestro_transversal_juegos'),

  INGEST_COMPANY: z.string().default('ACP'),

  /** Un solo lobby (sin comas). Para varios lobbies use CATALOG_LOBBIES. */
  INGEST_LOBBY: z
    .string()
    .default('livepoker')
    .refine((val) => !val.includes(','), {
      message:
        'INGEST_LOBBY debe ser un solo lobby (sin comas). Use CATALOG_LOBBIES para varios.',
    }),

  /**
   * Lobbies a consultar en DynamoDB (coma-separados).
   * Une los PK `LOBBY#{INGEST_COMPANY}#{lobby}` en el filtro del BFF.
   * Si no se define, se usa solo INGEST_LOBBY.
   */
  CATALOG_LOBBIES: z
    .string()
    .optional()
    .transform((val) => {
      if (!val?.trim()) return undefined;
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }),

  /** Moneda en parches mock (dev). Producción: payload proveedor / Calímaco */
  MOCK_CURRENCY: z.string().default('PEN'),

  DYNAMODB_ENDPOINT: z.string().url().optional(),

  AWS_REGION: z.string().default('us-east-1'),

  AWS_ACCESS_KEY_ID: z.string().optional(),

  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  CATALOG_REFRESH_INTERVAL_MS: z
    .string()
    .default('3600000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  CATALOG_FILTER_ENABLED: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),

  /** true = sin llamadas AWS (log local de fan-out) */
  IS_OFFLINE: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),

  /** Endpoint Management API: https://{api-id}.execute-api.{region}.amazonaws.com/{stage} */
  API_GATEWAY_WS_MANAGEMENT_ENDPOINT: z.string().url().optional(),

  LOBBY_PATCH_CHANNEL_PREFIX: z.string().default('lobby:patch'),

  /** Canal pub/sub; default lobby:patch:{INGEST_COMPANY}:{INGEST_LOBBY} */
  REDIS_PATCH_CHANNEL: z.string().optional(),

  /** Tabla DynamoDB ws-connections (PK id = GUEST# / USER#) */
  CONNECTIONS_TABLE_NAME: z.string().optional(),

  /** ConnectionIds coma-separados para pruebas locales de fan-out */
  FANOUT_CONNECTION_IDS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val?.trim()) return [] as string[];
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }),

  /** Log en consola en lugar de PostToConnection (default = IS_OFFLINE) */
  USE_LOCAL_FANOUT_LOG: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),

  // --- Evolution Lobby API ---
  EVOLUTION_LICENSEE_HOSTNAME: z.string().optional(),
  EVOLUTION_CASINO_ID: z.string().optional(),
  EVOLUTION_CASINO_KEY: z.string().optional(),
  EVOLUTION_API_TOKEN: z.string().optional(),
  EVOLUTION_CURRENCY: z.string().default('COP'),
  EVOLUTION_EXCLUSIONS: z.string().default('statistics,dealer'),
  EVOLUTION_PLAYER_UPDATES: z.string().default('true'),

  // --- Pragmatic DGA ---
  PRAGMATIC_DGA_URL: z
    .string()
    .url()
    .default('wss://dga.pragmaticplaylive.net/ws'),
  PRAGMATIC_CASINO_ID: z.string().optional(),
  PRAGMATIC_CURRENCY: z.string().default('COP'),
  PRAGMATIC_TABLE_IDS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val?.trim()) return [] as string[];
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }),

  // --- Operación ingesta proveedores ---
  PROVIDER_IDLE_TIMEOUT_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  INGESTION_QUEUE_MAX_SIZE: z
    .string()
    .default('2000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
}).transform((data) => {
  const IS_OFFLINE = data.IS_OFFLINE ?? data.NODE_ENV === 'development';
  const REDIS_PATCH_CHANNEL =
    data.REDIS_PATCH_CHANNEL ??
    `${data.LOBBY_PATCH_CHANNEL_PREFIX}:${data.INGEST_COMPANY}:${data.INGEST_LOBBY}`;
  const USE_LOCAL_FANOUT_LOG = data.USE_LOCAL_FANOUT_LOG ?? IS_OFFLINE;

  return {
    ...data,
    IS_OFFLINE,
    REDIS_PATCH_CHANNEL,
    USE_LOCAL_FANOUT_LOG,
    CATALOG_FILTER_ENABLED:
      data.CATALOG_FILTER_ENABLED ?? Boolean(data.DYNAMODB_ENDPOINT),
  };
});

/** Tipo inferido del esquema de entorno validado */
export type Env = z.infer<typeof envSchema>;

/**
 * Parsea y valida las variables de entorno de process.env.
 * Lanza un ZodError descriptivo si alguna variable es inválida.
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      '❌ Error de validación en variables de entorno:',
      result.error.format()
    );
    process.exit(1);
  }

  return result.data;
}

/** Configuración validada — importar como `import { env } from './config/env'` */
export const env: Env = loadEnv();
