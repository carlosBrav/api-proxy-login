const MOCK_PROVIDER_PREFIXES = [
  'evolution_',
  'pragmatic_',
  'playtech_',
  'ezugi_',
] as const;

export function stripMockProviderPrefix(id: string): string {
  for (const prefix of MOCK_PROVIDER_PREFIXES) {
    if (id.startsWith(prefix)) {
      return id.slice(prefix.length);
    }
  }
  return id;
}

/**
 * Comprueba si un external_id de parche coincide con un ID solicitado (ca_table_id Calímaco).
 * Match exacto o ca_table_id tras quitar un único prefijo mock de proveedor (p. ej. pragmatic_301 ↔ 301).
 */
export function patchMatchesExternalId(
  patchExternalId: string,
  requestedId: string
): boolean {
  if (patchExternalId === requestedId) {
    return true;
  }

  const strippedPatch = stripMockProviderPrefix(patchExternalId);
  return strippedPatch === requestedId;
}

export function patchMatchesAnyExternalId(
  patchExternalId: string,
  requestedIds: string[]
): boolean {
  return requestedIds.some((id) => patchMatchesExternalId(patchExternalId, id));
}
