import { fetchLobbyFromCalimaco } from './calimacoClient';
import { mapLobbyToCatalogRecords } from './fieldMapper';
import { upsertCatalogRecords } from './catalogUpsert';

export interface IngestEvent {
  company?: string;
  /** Un solo lobby (retrocompatible) */
  lobby?: string;
  /** Varios lobbies en una invocación */
  lobbies?: string[];
}

export interface IngestLobbySummary {
  lobby: string;
  fetched: number;
  mapped: number;
  skipped: number;
  upserted: number;
}

export interface IngestResult {
  status: string;
  company: string;
  /** Presente cuando se ingiere un solo lobby */
  lobby?: string;
  lobbies: IngestLobbySummary[];
  fetched: number;
  mapped: number;
  skipped: number;
  upserted: number;
}

function resolveLobbies(event: IngestEvent): string[] {
  if (event.lobbies?.length) {
    return event.lobbies;
  }
  if (event.lobby) {
    return [event.lobby];
  }

  const single = process.env.INGEST_LOBBY?.trim();
  if (single) {
    return [single];
  }

  const multi = process.env.INGEST_LOBBIES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi?.length) {
    return multi;
  }

  console.error(
    '[ingest-lobby] Error: defina INGEST_LOBBY (un lobby) o INGEST_LOBBIES (coma-separados) en .env.local o en el entorno.'
  );
  process.exit(1);
}

export async function handler(event: IngestEvent = {}): Promise<IngestResult> {
  const company = event.company ?? process.env.INGEST_COMPANY ?? 'ACP';
  const lobbies = resolveLobbies(event);

  console.log(
    `[ingest-lobby] Iniciando ingesta company=${company} lobbies=${lobbies.join(',')}`
  );

  const summaries: IngestLobbySummary[] = [];
  let totalFetched = 0;
  let totalMapped = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;

  for (const lobby of lobbies) {
    const rawLobby = await fetchLobbyFromCalimaco(company, lobby);
    const fetched = rawLobby.lobby.length;
    const { records, skipped } = mapLobbyToCatalogRecords(rawLobby, company, lobby);
    const upserted = await upsertCatalogRecords(records);

    summaries.push({
      lobby,
      fetched,
      mapped: records.length,
      skipped,
      upserted,
    });

    totalFetched += fetched;
    totalMapped += records.length;
    totalSkipped += skipped;
    totalUpserted += upserted;
  }

  const summary: IngestResult = {
    status: 'ok',
    company,
    lobby: lobbies.length === 1 ? lobbies[0] : undefined,
    lobbies: summaries,
    fetched: totalFetched,
    mapped: totalMapped,
    skipped: totalSkipped,
    upserted: totalUpserted,
  };

  console.log('[ingest-lobby] Resumen:', JSON.stringify(summary));

  return summary;
}

if (require.main === module) {
  handler().catch((err) => {
    console.error('[ingest-lobby] Error:', err);
    process.exit(1);
  });
}
