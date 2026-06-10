import { LiveGamesTablePatch } from '../../domain/LiveGamesTablePatch';
import { env } from '../../config/env';
import { ProviderAdapter } from '../ProviderAdapter';

interface EvolutionRawEvent {
  id?: string;
  type: string;
  table?: {
    id: string;
    name?: string;
    isOpen?: boolean;
    limits?: { min: number; max: number; currency: string };
    seats?: Array<{ id: number; occupied: boolean }>;
    playersCount?: number;
  };
  tableId?: string;
  tables?: Array<{
    id: string;
    name?: string;
    isOpen?: boolean;
    limits?: { min: number; max: number; currency: string };
    seats?: Array<{ id: number; occupied: boolean }>;
    playersCount?: number;
  }>;
  seats?: Array<{ id: number; occupied: boolean }>;
  playersCount?: number;
  minBet?: number;
}

export class EvolutionAdapter implements ProviderAdapter {
  readonly providerId = env.EVOLUTION_PROVIDER_ID;
  readonly providerName = 'Evolution Gaming';

  adapt(rawData: unknown): LiveGamesTablePatch[] {
    const event = rawData as EvolutionRawEvent;
    const normalizedType = event.type.toLowerCase();

    if (normalizedType === 'players_updated') {
      if (!event.tableId) return [];
      return [
        {
          external_id: event.tableId,
          idProveedor: this.providerId,
          realtime: {
            playersOnline: event.playersCount,
            minBet: event.minBet,
            updatedAt: new Date().toISOString(),
          },
        },
      ];
    }

    if (normalizedType === 'betting_opened') {
      if (!event.tableId) return [];
      return [
        {
          external_id: event.tableId,
          idProveedor: this.providerId,
          realtime: {
            bettingOpen: true,
            minBet: event.minBet,
            updatedAt: new Date().toISOString(),
          },
        },
      ];
    }

    if (normalizedType === 'betting_closed') {
      if (!event.tableId) return [];
      return [
        {
          external_id: event.tableId,
          idProveedor: this.providerId,
          realtime: {
            bettingOpen: false,
            minBet: event.minBet,
            updatedAt: new Date().toISOString(),
          },
        },
      ];
    }

    if (
      normalizedType === 'table_assigned' ||
      normalizedType === 'table_updated'
    ) {
      if (!event.table?.id) return [];
      return [this.mapTable(event.table)];
    }

    if (normalizedType === 'table_closed' || normalizedType === 'table_unassigned') {
      if (!event.tableId) return [];
      return [
        {
          external_id: event.tableId,
          idProveedor: this.providerId,
          realtime: {
            isAvailable: false,
            updatedAt: new Date().toISOString(),
          },
        },
      ];
    }

    if (normalizedType === 'seats_updated') {
      if (!event.tableId || !event.seats) return [];
      return [
        {
          external_id: event.tableId,
          idProveedor: this.providerId,
          realtime: {
            availableSeats: event.seats.filter((s) => !s.occupied).length,
            updatedAt: new Date().toISOString(),
          },
        },
      ];
    }

    if (normalizedType === 'state' && event.tables) {
      return event.tables.map((table) => this.mapTable(table));
    }

    return [];
  }

  private mapTable(
    table: NonNullable<EvolutionRawEvent['table']>
  ): LiveGamesTablePatch {
    let availableSeats: number | undefined;
    if (table.seats && Array.isArray(table.seats)) {
      availableSeats = table.seats.filter((s) => !s.occupied).length;
    }

    return {
      external_id: table.id,
      idProveedor: this.providerId,
      realtime: {
        minBet: table.limits?.min,
        maxBet: table.limits?.max,
        currency: table.limits?.currency,
        availableSeats,
        playersOnline: table.playersCount,
        isAvailable: table.isOpen ?? true,
        updatedAt: new Date().toISOString(),
      },
    };
  }
}
