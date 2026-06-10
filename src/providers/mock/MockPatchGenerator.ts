import { LiveGamesTablePatch } from '../../domain/LiveGamesTablePatch';
import { env } from '../../config/env';
import { catalogFilterService } from '../../catalog/CatalogFilterService';
import { ProviderRegistry } from '../ProviderRegistry';
import { EvolutionAdapter } from '../evolution/EvolutionAdapter';
import { PragmaticAdapter } from '../pragmatic/PragmaticAdapter';
import { PlaytechAdapter } from '../playtech/PlaytechAdapter';
import { EzugiAdapter } from '../ezugi/EzugiAdapter';

/**
 * Mesas mock alineadas a ca_table_id de getLobby Calímaco (jun 2026).
 * livepoker: Evolution/Pragmatic/Playtech. liveblackjack: incluye Ezugi (ez_1_*).
 * Fuente: lambda-ingest-lobby invoke:local / curl getLobby.
 */
const MOCK_TABLES = {
  evolution: [
    { id: 'THBTable00000001', type: 'blackjack', hasSeats: true },
    { id: 'n5emwq5c5dwepwam', type: 'roulette', hasSeats: false },
    { id: 'UTHTable00000001', type: 'holdem', hasSeats: false },
    { id: 'HoldemTable00001', type: 'holdem', hasSeats: false },
    { id: 'DHPTable00000001', type: 'blackjack', hasSeats: true },
  ],
  pragmatic: [
    { id: '2601', type: 'BLACKJACK', subtype: 'bj2', hasSeats: true },
    { id: '2701', type: 'ROULETTE', subtype: 'megaroulette', hasSeats: false },
  ],
  playtech: [{ id: 'chel;chel_casinoholdem', hasSeats: false }],
  ezugi: [{ id: 'ez_1_00000000000', hasSeats: true }],
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBool(): boolean {
  return Math.random() > 0.15;
}

function tablesAuthorizedForMock<T extends { id: string }>(tables: T[]): T[] {
  if (!catalogFilterService.isEnabled()) {
    return tables;
  }

  const authorized = new Set(catalogFilterService.getAuthorizedIds());
  if (authorized.size === 0) {
    return [];
  }

  return tables.filter((table) => authorized.has(table.id));
}

function pickRandomTable<T extends { id: string }>(tables: T[]): T | undefined {
  const authorized = tablesAuthorizedForMock(tables);
  if (authorized.length === 0) {
    return undefined;
  }
  return authorized[randomInt(0, authorized.length - 1)];
}

function generateEvolutionEvent() {
  const table = pickRandomTable(MOCK_TABLES.evolution);
  if (!table) {
    return null;
  }
  const seats = table.hasSeats
    ? Array.from({ length: 7 }, (_, i) => ({ id: i, occupied: Math.random() > 0.5 }))
    : undefined;

  return {
    id: `atlanticcitylive-pod3-${randomInt(10000, 99999)}-0`,
    type: 'table_assigned' as const,
    table: {
      id: table.id,
      name: `Mock ${table.type} ${table.id}`,
      isOpen: randomBool(),
      limits: {
        min: randomInt(1, 50) * 5,
        max: randomInt(500, 5000),
        currency: env.MOCK_CURRENCY,
      },
      seats,
      playersCount: randomInt(0, 120),
    },
  };
}

function generatePragmaticEvent() {
  const table = pickRandomTable(MOCK_TABLES.pragmatic);
  if (!table) {
    return null;
  }
  const isBlackjack = table.type === 'BLACKJACK' && table.subtype !== 'OneBJ';
  const seatState = isBlackjack
    ? {
        availableSeats: randomInt(0, 7),
        seat1: randomBool(),
        seat2: randomBool(),
        seat3: randomBool(),
        seat4: randomBool(),
        seat5: randomBool(),
        seat6: randomBool(),
        seat7: randomBool(),
      }
    : {};

  return {
    tableId: table.id,
    tableName: `Mock Pragmatic ${table.type}`,
    tableType: table.type,
    tableSubtype: table.subtype,
    tableOpen: randomBool(),
    currency: env.MOCK_CURRENCY,
    totalSeatedPlayers: randomInt(0, 500),
    ...seatState,
    tableLimits: {
      minBet: randomInt(1, 25),
      maxBet: randomInt(1000, 10000),
      maxPlayers: 500,
    },
  };
}

function generatePlaytechEvent() {
  const table = pickRandomTable(MOCK_TABLES.playtech);
  if (!table) {
    return null;
  }
  return {
    table_id: table.id,
    status: randomBool() ? ('OPEN' as const) : ('CLOSED' as const),
    free_seats: table.hasSeats ? randomInt(0, 7) : 0,
    min_bet: randomInt(5, 100),
    currency: env.MOCK_CURRENCY,
    timestamp: new Date().toISOString(),
  };
}

function generateEzugiEvent() {
  const table = pickRandomTable(MOCK_TABLES.ezugi);
  if (!table) {
    return null;
  }
  return {
    game_id: table.id,
    game_type: table.hasSeats ? 'blackjack' : 'roulette',
    is_open: randomBool(),
    min_bet: randomInt(5, 50),
    currency: env.MOCK_CURRENCY,
    seats_available: table.hasSeats ? randomInt(0, 7) : undefined,
    updated_at: new Date().toISOString(),
  };
}

export function registerAllAdapters(): void {
  ProviderRegistry.register(new EvolutionAdapter());
  ProviderRegistry.register(new PragmaticAdapter());
  ProviderRegistry.register(new PlaytechAdapter());
  ProviderRegistry.register(new EzugiAdapter());
}

function adaptIfEvent<T>(
  providerId: number,
  event: T | null
): LiveGamesTablePatch[] {
  if (event === null) {
    return [];
  }
  return ProviderRegistry.get(providerId).adapt(event);
}

export function generateMockPatches(): LiveGamesTablePatch[] {
  const allPatches: LiveGamesTablePatch[] = [];

  allPatches.push(...adaptIfEvent(env.EVOLUTION_PROVIDER_ID, generateEvolutionEvent()));
  allPatches.push(...adaptIfEvent(env.PRAGMATIC_PROVIDER_ID, generatePragmaticEvent()));
  allPatches.push(...adaptIfEvent(env.PLAYTECH_PROVIDER_ID, generatePlaytechEvent()));
  allPatches.push(...adaptIfEvent(env.EZUGI_PROVIDER_ID, generateEzugiEvent()));

  return allPatches;
}
