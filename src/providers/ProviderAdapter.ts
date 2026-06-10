import { LiveGamesTablePatch } from '../domain/LiveGamesTablePatch';

/**
 * ProviderAdapter — Interfaz del patrón Adapter.
 *
 * Cada proveedor de casino en vivo (Evolution, Pragmatic, Playtech, Ezugi, etc.)
 * implementa esta interfaz para normalizar sus datos crudos (raw) propietarios
 * al contrato canónico `LiveGamesTablePatch`.
 */
export interface ProviderAdapter {
  readonly providerId: number;
  readonly providerName: string;
  adapt(rawData: unknown): LiveGamesTablePatch[];
}
