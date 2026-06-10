import { LiveGamesTablePatch } from '../../domain/LiveGamesTablePatch';
import { env } from '../../config/env';
import { ProviderAdapter } from '../ProviderAdapter';

interface PragmaticRawEvent {
  tableId: string;
  tableName?: string;
  tableType?: string;
  tableSubtype?: string;
  tableOpen?: boolean;
  currency?: string;
  totalSeatedPlayers?: number;
  availableSeats?: number;
  seat1?: boolean;
  seat2?: boolean;
  seat3?: boolean;
  seat4?: boolean;
  seat5?: boolean;
  seat6?: boolean;
  seat7?: boolean;
  tableLimits?: {
    minBet?: number;
    maxBet?: number;
    maxPlayers?: number;
  };
  boxes?: Array<{ status?: string; cardsPosition?: number }>;
}

export class PragmaticAdapter implements ProviderAdapter {
  readonly providerId = env.PRAGMATIC_PROVIDER_ID;
  readonly providerName = 'Pragmatic Play';

  adapt(rawData: unknown): LiveGamesTablePatch[] {
    const event = rawData as PragmaticRawEvent;
    if (!event?.tableId) return [];

    const isClassicBlackjack =
      event.tableType === 'BLACKJACK' && event.tableSubtype !== 'OneBJ';

    let availableSeats: number | undefined;
    if (isClassicBlackjack) {
      if (Array.isArray(event.boxes) && event.boxes.length > 0) {
        availableSeats = event.boxes.filter((box) => box.status !== 'Occupied').length;
      } else if (typeof event.availableSeats === 'number') {
        availableSeats = event.availableSeats;
      }
    }

    return [
      {
        external_id: event.tableId,
        idProveedor: this.providerId,
        realtime: {
          minBet: event.tableLimits?.minBet,
          maxBet: event.tableLimits?.maxBet,
          currency: event.currency ?? env.PRAGMATIC_CURRENCY,
          isAvailable: event.tableOpen,
          bettingOpen: event.tableOpen,
          playersOnline: event.totalSeatedPlayers,
          availableSeats,
          updatedAt: new Date().toISOString(),
        },
      },
    ];
  }
}
