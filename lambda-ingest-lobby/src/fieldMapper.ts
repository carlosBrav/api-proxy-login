import { CalimacoLobbyItem, CalimacoLobbyResponse } from './calimacoClient';

export interface CatalogRecord {
  pk: string;
  sk: string;
  ca_name: string | null;
  ca_type: string | null;
  ca_machine: string | null;
  ca_game_type: string | null;
  ca_table_id: string;
  ca_provider: string | null;
  ca_sub_provider: string | null;
  ingested_at: string;
}

export interface MapLobbyResult {
  records: CatalogRecord[];
  skipped: number;
}

/**
 * Parsea tags cl_live_* → ca_game_type (ej. cl_live_poker → poker).
 */
export function parseCaGameType(tags: string[] | string | undefined): string | null {
  const list = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim())
      : [];

  const liveTag = list.find((t) => /^cl_live_/i.test(t));
  if (!liveTag) return null;

  return liveTag.replace(/^cl_live_/i, '').toLowerCase();
}

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function mapItem(
  item: CalimacoLobbyItem,
  pk: string,
  ingestedAt: string
): CatalogRecord | null {
  const externalId = item.external_id?.trim();
  if (!externalId) return null;

  return {
    pk,
    sk: `TABLE#${externalId}`,
    ca_name: toNullableString(item.name),
    ca_type: toNullableString(item.type),
    ca_machine: toNullableString(item.machine),
    ca_game_type: parseCaGameType(item.tags),
    ca_table_id: externalId,
    ca_provider: toNullableString(item.provider),
    ca_sub_provider: toNullableString(item.sub_provider),
    ingested_at: ingestedAt,
  };
}

/**
 * Mapea respuesta getLobby a registros DynamoDB.
 * PK: LOBBY#{company}#{lobby}, SK: TABLE#{ca_table_id}
 */
export function mapLobbyToCatalogRecords(
  response: CalimacoLobbyResponse,
  company: string,
  lobby: string
): MapLobbyResult {
  const pk = `LOBBY#${company}#${lobby}`;
  const ingestedAt = new Date().toISOString();
  const records: CatalogRecord[] = [];
  let skipped = 0;

  for (const item of response.lobby) {
    const record = mapItem(item, pk, ingestedAt);
    if (record) {
      records.push(record);
    } else {
      skipped += 1;
      console.warn(
        `[fieldMapper] Omitido ítem sin external_id: name=${item.name ?? 'n/a'}`
      );
    }
  }

  return { records, skipped };
}
