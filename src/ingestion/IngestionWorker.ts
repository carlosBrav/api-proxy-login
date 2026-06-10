import { env } from '../config/env';
import { generateMockPatches } from '../providers/mock/MockPatchGenerator';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { EvolutionConnector } from '../providers/evolution/EvolutionConnector';
import { PragmaticConnector } from '../providers/pragmatic/PragmaticConnector';
import { ProviderOrchestrator } from './ProviderOrchestrator';
import { publishFilteredPatches } from './publishPatches';
import { PatchPublisher } from '../pubsub/PatchPublisher';

const MOCK_INTERVAL_MS = 3000;

function handleProviderPayload(
  providerId: number,
  payload: unknown,
  patchPublisher: PatchPublisher,
  logPrefix: string
): void {
  try {
    const patches = ProviderRegistry.get(providerId).adapt(payload);
    publishFilteredPatches(patches, patchPublisher, logPrefix);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} Error adaptando payload:`, message);
  }
}

function startRealProviderIngestion(patchPublisher: PatchPublisher): void {
  const connectors = [];

  try {
    connectors.push(
      new EvolutionConnector((payload) =>
        handleProviderPayload(
          env.EVOLUTION_PROVIDER_ID,
          payload,
          patchPublisher,
          '[Evolution]'
        )
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Ingestion] Evolution no iniciado:', message);
  }

  try {
    connectors.push(
      new PragmaticConnector((payload) =>
        handleProviderPayload(
          env.PRAGMATIC_PROVIDER_ID,
          payload,
          patchPublisher,
          '[Pragmatic]'
        )
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Ingestion] Pragmatic no iniciado:', message);
  }

  if (connectors.length === 0) {
    console.error('[Ingestion] Sin conectores activos. Revise credenciales y PRAGMATIC_TABLE_IDS.');
    return;
  }

  const orchestrator = new ProviderOrchestrator(connectors);
  orchestrator.startImmediately();
  console.log(`[Ingestion] ${connectors.length} conector(es) real(es) en marcha.`);
}

function startMockIngestion(patchPublisher: PatchPublisher): void {
  console.log('[MockRunner] Iniciando generador de datos dummy de proveedores...');

  setInterval(() => {
    const rawPatches = generateMockPatches();
    publishFilteredPatches(rawPatches, patchPublisher, '[MockRunner]');
  }, MOCK_INTERVAL_MS);
}

export function startIngestionWorker(patchPublisher: PatchPublisher): void {
  if (!env.MOCK_PROVIDERS) {
    console.log('[Ingestion] MOCK_PROVIDERS=false — conectores reales.');
    startRealProviderIngestion(patchPublisher);
    return;
  }

  startMockIngestion(patchPublisher);
}
