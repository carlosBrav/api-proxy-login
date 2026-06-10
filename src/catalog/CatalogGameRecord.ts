/**
 * Registro de catálogo en DynamoDB col_maestro_transversal_juegos.
 * PK: LOBBY#{company}#{lobby}, SK: TABLE#{ca_table_id}
 */
export interface CatalogGameRecord {
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
