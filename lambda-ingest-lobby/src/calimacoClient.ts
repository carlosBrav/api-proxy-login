export interface CalimacoLobbyItem {
  name?: string;
  type?: string;
  machine?: string;
  external_id?: string;
  provider?: string;
  sub_provider?: string;
  tags?: string[] | string;
}

export interface CalimacoLobbyResponse {
  lobby: CalimacoLobbyItem[];
}

function resolveGetLobbyUrl(): string {
  return (
    process.env.GET_LOBBY_URL ??
    process.env.CALIMACO_GET_LOBBY_URL ??
    'https://api.casinoatlanticcity.com/api/contents/getLobby'
  );
}

function buildLimits(): string {
  const init = Number(process.env.INGEST_LIMITS_INIT ?? '0');
  const end = Number(process.env.INGEST_LIMITS_END ?? '25');
  return JSON.stringify({ init, end });
}

function buildFilter(): string {
  return (
    process.env.INGEST_FILTER ??
    JSON.stringify({ name: '', providers: '', tags: '' })
  );
}

/**
 * POST getLobby Calímaco con body application/x-www-form-urlencoded.
 */
export async function fetchLobbyFromCalimaco(
  company: string,
  lobby: string
): Promise<CalimacoLobbyResponse> {
  const url = resolveGetLobbyUrl();
  const body = new URLSearchParams({
    company,
    lobby,
    limits: buildLimits(),
    filter: buildFilter(),
  });

  console.log(`[calimacoClient] POST getLobby company=${company} lobby=${lobby}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[calimacoClient] getLobby HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const data = (await response.json()) as CalimacoLobbyResponse;
  const count = Array.isArray(data.lobby) ? data.lobby.length : 0;
  console.log(`[calimacoClient] Respuesta OK: ${count} ítems en lobby[]`);

  return {
    lobby: Array.isArray(data.lobby) ? data.lobby : [],
  };
}
