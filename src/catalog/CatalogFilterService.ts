import { env } from '../config/env';
import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';
import { stripMockProviderPrefix } from '../domain/externalIdMatch';
import { fetchAuthorizedTableIds, getCatalogLobbies } from './catalogRefresh';

/**
 * CatalogFilterService — filtra parches contra el catálogo DynamoDB.
 * Mantiene en memoria un Set de ca_table_id autorizados (refresh horario / startup).
 */
export class CatalogFilterService {
  private authorizedIds: Set<string> = new Set();
  private enabled: boolean;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { enabled?: boolean }) {
    this.enabled = options?.enabled ?? env.CATALOG_FILTER_ENABLED;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getCatalogSize(): number {
    return this.authorizedIds.size;
  }

  getAuthorizedIds(): string[] {
    return [...this.authorizedIds];
  }

  isDegraded(): boolean {
    return this.enabled && this.authorizedIds.size === 0;
  }

  /** Deshabilita filtro (modo dev sin DynamoDB) */
  allowAllInDev(): void {
    this.enabled = false;
  }

  /** Inyecta IDs para tests o MOCK_CATALOG */
  setMockAuthorizedIds(ids: string[]): void {
    this.authorizedIds = new Set(ids);
    this.enabled = true;
  }

  async refresh(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const ids = await fetchAuthorizedTableIds();
      this.authorizedIds = ids;
      console.log(`[CatalogFilter] Refrescado: ${ids.size} mesas autorizadas`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hadSnapshot = this.authorizedIds.size > 0;

      if (env.DYNAMODB_ENDPOINT && !hadSnapshot) {
        console.error(
          `[CatalogFilter] ❌ No se pudo cargar el catálogo desde ${env.DYNAMODB_ENDPOINT}. ` +
            `Verifica docker/Floki, credenciales AWS y que lambda-ingest-lobby haya poblado ` +
            `${env.CATALOG_TABLE_NAME} (pk=LOBBY#${env.INGEST_COMPANY}#{${getCatalogLobbies().join('|')}}). ` +
            `Detalle: ${message}`
        );
      } else {
        console.warn(
          `[CatalogFilter] Fallo refresh, manteniendo snapshot (${this.authorizedIds.size} ids): ${message}`
        );
      }
    }
  }

  startPeriodicRefresh(): void {
    if (!this.enabled || this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, env.CATALOG_REFRESH_INTERVAL_MS);

    if (typeof this.refreshTimer.unref === 'function') {
      this.refreshTimer.unref();
    }
  }

  stopPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Lookup por tableID crudo del proveedor (pre-adapter) */
  isAuthorized(tableId: string): boolean {
    return this.matchesCatalog(tableId);
  }

  /** Lookup por external_id del parche (prod: ca_table_id sin prefijos mock) */
  isAuthorizedExternalId(externalId: string): boolean {
    return this.matchesCatalog(externalId);
  }

  private matchesCatalog(id: string): boolean {
    if (!this.enabled) {
      return true;
    }

    if (this.authorizedIds.size === 0) {
      return false;
    }

    if (this.authorizedIds.has(id)) {
      return true;
    }

    if (env.MOCK_PROVIDERS) {
      const stripped = stripMockProviderPrefix(id);
      return stripped !== id && this.authorizedIds.has(stripped);
    }

    return false;
  }

  filterPatches(patches: LiveGamesTablePatch[]): LiveGamesTablePatch[] {
    if (!this.enabled) {
      return patches;
    }

    return patches.filter((p) => this.isAuthorizedExternalId(p.external_id));
  }
}

export const catalogFilterService = new CatalogFilterService();
