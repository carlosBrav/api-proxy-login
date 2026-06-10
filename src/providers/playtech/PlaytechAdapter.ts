import { LiveGamesTablePatch } from '../../domain/LiveGamesTablePatch';
import { env } from '../../config/env';
import { ProviderAdapter } from '../ProviderAdapter';

interface PlaytechRawEvent {
  table_id: string;
  status: 'OPEN' | 'CLOSED';
  free_seats: number;
  min_bet?: number;
  currency?: string;
  timestamp: string;
}

export class PlaytechAdapter implements ProviderAdapter {
  readonly providerId = env.PLAYTECH_PROVIDER_ID;
  readonly providerName = 'Playtech (Eurolive)';

  adapt(rawData: unknown): LiveGamesTablePatch[] {
    const event = rawData as PlaytechRawEvent;

    return [
      {
        external_id: event.table_id,
        idProveedor: this.providerId,
        realtime: {
          minBet: event.min_bet,
          currency: event.currency,
          availableSeats: event.free_seats,
          isAvailable: event.status === 'OPEN',
          updatedAt: new Date(event.timestamp).toISOString(),
        },
      },
    ];
  }
}
