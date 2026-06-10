import WebSocket from 'ws';
import axios from 'axios';
import { env } from '../../config/env';
import { IngestionQueue } from '../../ingestion/IngestionQueue';
import { ProviderConnector } from '../ProviderConnector';

interface EvLimits {
  min: number;
  max: number;
  currency: string;
}

interface EvSeat {
  id: number;
  occupied: boolean;
}

interface EvTable {
  id: string;
  name?: string;
  isOpen?: boolean;
  limits?: EvLimits;
  seats?: EvSeat[];
  playersCount?: number;
}

interface EvBaseMessage {
  id: string;
  type: string;
}

interface EvStateMessage extends EvBaseMessage {
  type: 'state' | 'State';
  tables: EvTable[] | Record<string, EvTable>;
}

interface EvTableAssignedMessage extends EvBaseMessage {
  type: 'table_assigned' | 'TableAssigned';
  table: EvTable;
}

interface EvTableUpdatedMessage extends EvBaseMessage {
  type: 'table_updated' | 'TableUpdated';
  table: EvTable;
}

interface EvTableClosedMessage extends EvBaseMessage {
  type: 'table_closed' | 'TableClosed';
  tableId: string;
}

interface EvSeatsUpdatedMessage extends EvBaseMessage {
  type: 'seats_updated' | 'SeatsUpdated';
  tableId: string;
  seats: EvSeat[];
}

interface EvPlayersUpdatedMessage extends EvBaseMessage {
  type: 'players_updated' | 'PlayersUpdated';
  tableId: string;
  playersCount: number;
}

type EvMessage =
  | EvStateMessage
  | EvTableAssignedMessage
  | EvTableUpdatedMessage
  | EvTableClosedMessage
  | EvSeatsUpdatedMessage
  | EvPlayersUpdatedMessage;

export class EvolutionConnector implements ProviderConnector {
  readonly name = 'Evolution';

  private ws: WebSocket | null = null;
  private isConnecting = false;
  private fatalAuthError = false;
  private readonly ingestionQueue = new IngestionQueue();

  constructor(private readonly onMessage: (payload: unknown) => void) {
    if (
      !env.EVOLUTION_LICENSEE_HOSTNAME ||
      !env.EVOLUTION_CASINO_ID ||
      !env.EVOLUTION_CASINO_KEY ||
      !env.EVOLUTION_API_TOKEN
    ) {
      throw new Error(
        '[Evolution] Faltan EVOLUTION_LICENSEE_HOSTNAME, EVOLUTION_CASINO_ID, EVOLUTION_CASINO_KEY o EVOLUTION_API_TOKEN'
      );
    }
  }

  private getAuthHeader(): string {
    const credentials = `${env.EVOLUTION_CASINO_KEY!.trim()}:${env.EVOLUTION_API_TOKEN!.trim()}`;
    return `Basic ${Buffer.from(credentials, 'utf-8').toString('base64')}`;
  }

  private getEndpoints(): { httpUrl: string; wsUrl: string } {
    const params = new URLSearchParams({
      gameProvider: 'evolution',
      currency: env.EVOLUTION_CURRENCY,
      exclude: env.EVOLUTION_EXCLUSIONS,
    });
    const base = `https://${env.EVOLUTION_LICENSEE_HOSTNAME}/api/lobby/v1/${env.EVOLUTION_CASINO_ID}/live`;
    const query = params.toString();
    return {
      httpUrl: `${base}?${query}`,
      wsUrl: `wss://${env.EVOLUTION_LICENSEE_HOSTNAME}/api/lobby/v1/${env.EVOLUTION_CASINO_ID}/live?${query}`,
    };
  }

  async fetchInitialState(): Promise<{ tables: EvTable[]; fatalError: boolean }> {
    const { httpUrl } = this.getEndpoints();
    try {
      console.log(`[Evolution][HTTP] Solicitando estado base`);
      const response = await axios.get<{ tables: EvTable[] }>(httpUrl, {
        timeout: 10000,
        headers: { Authorization: this.getAuthHeader() },
      });
      return { tables: response.data.tables ?? [], fatalError: false };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401) {
        console.error(
          '[Evolution][HTTP] Autenticación rechazada (401). Verificar EVOLUTION_CASINO_KEY y EVOLUTION_API_TOKEN.'
        );
        this.fatalAuthError = true;
        return { tables: [], fatalError: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Evolution][HTTP] Error obteniendo estado inicial:', message);
      return { tables: [], fatalError: false };
    }
  }

  connectStreaming(): void {
    if (this.isConnecting || this.fatalAuthError) return;
    this.isConnecting = true;

    const { wsUrl } = this.getEndpoints();
    console.log('[Evolution][WSS] Conectando...');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[Evolution][WSS] Conexión establecida');
        this.isConnecting = false;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const raw = this.decodeMessage(data);
          const message = JSON.parse(raw) as EvMessage;
          this.processEvent(message);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[Evolution][WSS] Error al procesar frame:', message);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.isConnecting = false;
        const reasonStr = reason.toString();
        console.warn(`[Evolution][WSS] Cerrado. Código: ${code}, Razón: ${reasonStr}`);

        if (this.fatalAuthError) return;

        if (code === 4000) {
          void this.resyncAndReconnect();
        } else if (code === 4001 || reasonStr.includes('401')) {
          console.error('[Evolution][WSS] Autenticación rechazada (401).');
          this.fatalAuthError = true;
        } else {
          this.reconnectWithBackoff();
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('[Evolution][WSS] Error en socket:', error.message);
        this.ws?.close();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Evolution][WSS] Error abriendo conexión:', message);
      this.isConnecting = false;
      this.reconnectWithBackoff();
    }
  }

  private decodeMessage(data: WebSocket.Data): string {
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }
    if (Array.isArray(data)) {
      return Buffer.concat(data as Buffer[]).toString('utf8');
    }
    return data.toString();
  }

  private processEvent(message: EvMessage): void {
    switch (message.type) {
      case 'state':
      case 'State': {
        const tablesRaw = message.tables;
        const tablesArray: EvTable[] = Array.isArray(tablesRaw)
          ? tablesRaw
          : Object.values(tablesRaw as Record<string, EvTable>);

        for (const table of tablesArray) {
          this.ingestionQueue.enqueue(() =>
            this.onMessage({
              type: 'table_assigned',
              id: message.id,
              table,
            })
          );
        }
        break;
      }
      case 'table_assigned':
      case 'table_updated':
      case 'TableAssigned':
      case 'TableUpdated':
        this.ingestionQueue.enqueue(() =>
          this.onMessage({
            type: message.type,
            id: message.id,
            table: message.table,
          })
        );
        break;
      case 'table_closed':
      case 'TableClosed':
        this.ingestionQueue.enqueue(() =>
          this.onMessage({
            type: 'table_closed',
            id: message.id,
            tableId: message.tableId,
          })
        );
        break;
      case 'seats_updated':
      case 'SeatsUpdated':
        this.ingestionQueue.enqueue(() =>
          this.onMessage({
            type: 'seats_updated',
            id: message.id,
            tableId: message.tableId,
            seats: message.seats,
          })
        );
        break;
      case 'players_updated':
      case 'PlayersUpdated':
        this.ingestionQueue.enqueue(() =>
          this.onMessage({
            type: 'players_updated',
            id: message.id,
            tableId: message.tableId,
            playersCount: message.playersCount,
          })
        );
        break;
    }
  }

  private async resyncAndReconnect(): Promise<void> {
    const result = await this.fetchInitialState();
    console.log(`[Evolution][HTTP] Resync tras GAP. ${result.tables.length} mesas.`);
    if (!result.fatalError) {
      this.connectStreaming();
    }
  }

  private reconnectWithBackoff(attempt = 1): void {
    if (this.fatalAuthError) return;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    console.log(`[Evolution][WSS] Reintento en ${delay / 1000}s (intento ${attempt})`);
    setTimeout(() => this.connectStreaming(), delay);
  }

  async start(): Promise<void> {
    this.connectStreaming();
  }

  async dispose(): Promise<void> {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
    console.log('[Evolution] Conector desconectado.');
  }
}
