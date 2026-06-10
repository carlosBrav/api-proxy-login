import { LiveGamesTablePatch } from '../../domain/LiveGamesTablePatch';
import { env } from '../../config/env';
import { ProviderAdapter } from '../ProviderAdapter';

interface EzugiRawEvent {
  game_id: string;
  game_type: string;
  is_open: boolean;
  min_bet?: number;
  currency?: string;
  seats_available?: number;
  updated_at: string;
}

export class EzugiAdapter implements ProviderAdapter {
  readonly providerId = env.EZUGI_PROVIDER_ID;
  readonly providerName = 'Ezugi';

  adapt(rawData: unknown): LiveGamesTablePatch[] {
    const event = rawData as EzugiRawEvent;

    return [
      {
        external_id: event.game_id,
        idProveedor: this.providerId,
        realtime: {
          minBet: event.min_bet,
          currency: event.currency,
          availableSeats: event.seats_available,
          isAvailable: event.is_open,
          updatedAt: new Date(event.updated_at).toISOString(),
        },
      },
    ];
  }
}
