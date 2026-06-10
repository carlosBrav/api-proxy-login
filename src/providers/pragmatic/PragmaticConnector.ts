import WebSocket from 'ws';
import { env } from '../../config/env';
import { catalogFilterService } from '../../catalog/CatalogFilterService';
import { IngestionQueue } from '../../ingestion/IngestionQueue';
import { ProviderConnector } from '../ProviderConnector';

function resolvePragmaticTableIds(): string[] {
  const configured = env.PRAGMATIC_TABLE_IDS;
  if (!catalogFilterService.isEnabled()) {
    return configured;
  }

  const authorized = new Set(catalogFilterService.getAuthorizedIds());
  if (authorized.size === 0) {
    return [];
  }

  return configured.filter((id) => authorized.has(id));
}

export class PragmaticConnector implements ProviderConnector {
  readonly name = 'Pragmatic';

  private ws: WebSocket | null = null;
  private isConnecting = false;
  private pingTimeout: NodeJS.Timeout | null = null;
  private readonly ingestionQueue = new IngestionQueue();
  private readonly tableIds: string[];
  private baseDelay = 1000;
  private maxDelay = 30000;
  private currentAttempt = 0;
  private fatalAuthError = false;

  constructor(private readonly onMessage: (payload: unknown) => void) {
    if (!env.PRAGMATIC_CASINO_ID) {
      throw new Error('[Pragmatic] Falta PRAGMATIC_CASINO_ID');
    }

    this.tableIds = resolvePragmaticTableIds();
    if (env.PRAGMATIC_TABLE_IDS.length > 0 && this.tableIds.length === 0) {
      console.warn(
        '[Pragmatic] Ningún PRAGMATIC_TABLE_IDS coincide con el catálogo autorizado.'
      );
    }
    if (this.tableIds.length === 0 && env.PRAGMATIC_TABLE_IDS.length === 0) {
      throw new Error('[Pragmatic] Falta PRAGMATIC_TABLE_IDS');
    }
  }

  connect(): void {
    if (
      this.isConnecting ||
      this.fatalAuthError ||
      (this.ws && this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    if (this.tableIds.length === 0) {
      console.warn('[Pragmatic] Sin mesas para suscribir — conexión omitida.');
      return;
    }

    this.isConnecting = true;
    console.log(`[Pragmatic][WSS] Conectando a ${env.PRAGMATIC_DGA_URL}`);

    this.ws = new WebSocket(env.PRAGMATIC_DGA_URL);
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data: WebSocket.Data) => this.handleMessage(data));
    this.ws.on('ping', () => this.handlePing());
    this.ws.on('pong', () => this.handlePong());
    this.ws.on('error', (err: Error) => this.handleError(err));
    this.ws.on('close', (code: number, reason: Buffer) =>
      this.handleClose(code, reason.toString())
    );
  }

  private handleOpen(): void {
    console.log('[Pragmatic][WSS] Conexión abierta');
    this.isConnecting = false;
    this.currentAttempt = 0;
    this.heartbeat();

    const subscriptionMessage = {
      type: 'subscribe',
      isDeltaEnabled: true,
      casinoId: env.PRAGMATIC_CASINO_ID,
      currency: env.PRAGMATIC_CURRENCY,
      key: this.tableIds,
    };

    console.log(
      `[Pragmatic][WSS] Suscripción enviada (${this.tableIds.length} mesas)`
    );
    this.ws?.send(JSON.stringify(subscriptionMessage));
  }

  private handleMessage(rawData: WebSocket.Data): void {
    this.heartbeat();

    try {
      const messageString = rawData.toString();
      if (!messageString) return;

      const payload: unknown = JSON.parse(messageString);
      if (
        payload &&
        typeof payload === 'object' &&
        'tableId' in payload &&
        payload.tableId
      ) {
        this.ingestionQueue.enqueue(() => this.onMessage(payload));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Pragmatic][WSS] Error parseando JSON:', message);
    }
  }

  private heartbeat(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
    }
    this.pingTimeout = setTimeout(() => {
      console.warn('[Pragmatic][WSS] Timeout de inactividad. Cerrando...');
      this.terminateConnection();
    }, 35000);
  }

  private handlePing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.pong();
    }
    this.heartbeat();
  }

  private handlePong(): void {
    this.heartbeat();
  }

  private handleError(err: Error): void {
    console.error('[Pragmatic][WSS] Error:', err.message);
  }

  private handleClose(code: number, reason: string): void {
    console.warn(`[Pragmatic][WSS] Cerrado. Código: ${code}, Razón: ${reason}`);
    this.isConnecting = false;
    this.ws = null;

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }

    if (
      code === 4001 ||
      code === 401 ||
      reason.includes('401') ||
      reason.includes('403') ||
      reason.includes('Unauthorized')
    ) {
      console.error(
        '[Pragmatic][WSS] Autenticación rechazada. Sin reconexión automática.'
      );
      this.fatalAuthError = true;
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.fatalAuthError) return;

    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.currentAttempt),
      this.maxDelay
    );
    const jitter = Math.random() * 500;
    const finalDelay = delay + jitter;
    this.currentAttempt++;

    console.log(
      `[Pragmatic][WSS] Reconexión en ${Math.round(finalDelay) / 1000}s (intento ${this.currentAttempt})`
    );
    setTimeout(() => this.connect(), finalDelay);
  }

  private terminateConnection(): void {
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {
        // ignore
      }
    }
  }

  async start(): Promise<void> {
    this.connect();
  }

  async dispose(): Promise<void> {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    this.isConnecting = false;
    this.currentAttempt = 0;
    console.log('[Pragmatic] Conector desconectado.');
  }
}
