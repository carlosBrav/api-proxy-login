import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';

/**
 * ProviderFilter — filtro por idProveedor (mensaje WSS del cliente).
 * Stub: sin suscripciones activas, no filtra en el hot path de ingesta mock.
 */
export class ProviderFilter {
  private activeProviderIds: Set<number> | null = null;

  setActiveProviders(providerIds: number[]): void {
    this.activeProviderIds = new Set(providerIds);
  }

  clear(): void {
    this.activeProviderIds = null;
  }

  filterPatches(patches: LiveGamesTablePatch[]): LiveGamesTablePatch[] {
    if (this.activeProviderIds === null) {
      return patches;
    }
    return patches.filter((p) => this.activeProviderIds!.has(p.idProveedor));
  }
}

export const providerFilter = new ProviderFilter();
