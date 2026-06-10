/**
 * Prueba rápida del endpoint Calímaco getLobby (sin DynamoDB).
 *
 * Uso:
 *   npx ts-node scripts/test-getLobby.ts
 *   INGEST_COMPANY=ACP INGEST_LOBBY=livepoker npx ts-node scripts/test-getLobby.ts
 */
import { fetchLobbyFromCalimaco } from '../src/calimacoClient';

async function main(): Promise<void> {
  const company = process.env.INGEST_COMPANY ?? 'ACP';
  const lobby = process.env.INGEST_LOBBY ?? 'livepoker';

  console.log(`[test-getLobby] POST getLobby company=${company} lobby=${lobby}`);

  const data = await fetchLobbyFromCalimaco(company, lobby);
  const items = data.lobby;
  const first = items[0];

  console.log('[test-getLobby] OK');
  console.log(`  ítems en lobby[]: ${items.length}`);
  if (first) {
    console.log(`  primer external_id: ${first.external_id ?? 'n/a'}`);
    console.log(`  primer name: ${first.name ?? 'n/a'}`);
  } else {
    console.log('  (lobby vacío)');
  }
}

main().catch((err) => {
  console.error('[test-getLobby] Error:', err);
  process.exit(1);
});
