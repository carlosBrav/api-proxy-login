import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';
import { catalogFilterService } from '../catalog/CatalogFilterService';
import { providerFilter } from './ProviderFilter';
import { liveGamesStore } from '../pubsub/LiveGamesStore';
import { PatchPublisher } from '../pubsub/PatchPublisher';

export function publishFilteredPatches(
  rawPatches: LiveGamesTablePatch[],
  patchPublisher: PatchPublisher,
  logPrefix = '[Ingestion]'
): void {
  if (rawPatches.length === 0) return;

  const catalogFiltered = catalogFilterService.filterPatches(rawPatches);

  if (
    catalogFilterService.isEnabled() &&
    catalogFiltered.length < rawPatches.length
  ) {
    console.debug(
      `${logPrefix} Catálogo descartó ${rawPatches.length - catalogFiltered.length}/${rawPatches.length} parches`
    );
  }

  const patches = providerFilter.filterPatches(catalogFiltered);
  if (patches.length === 0) return;

  liveGamesStore.setMany(patches);
  patchPublisher.publish(patches);
}
