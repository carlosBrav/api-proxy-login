import { ProviderAdapter } from './ProviderAdapter';

/**
 * ProviderRegistry — Patrón Strategy centralizado.
 *
 * Registro global de adaptadores. El sistema obtiene el adaptador correcto
 * para cada proveedor de forma dinámica mediante su `providerId`.
 */
export class ProviderRegistry {
  private static adapters: Map<number, ProviderAdapter> = new Map();

  static register(adapter: ProviderAdapter): void {
    if (ProviderRegistry.adapters.has(adapter.providerId)) {
      console.warn(
        `[ProviderRegistry] ⚠️ Reemplazando adaptador existente para providerId=${adapter.providerId} (${adapter.providerName})`
      );
    }
    ProviderRegistry.adapters.set(adapter.providerId, adapter);
    console.log(
      `[ProviderRegistry] ✅ Registrado adaptador: ${adapter.providerName} (id=${adapter.providerId})`
    );
  }

  static get(providerId: number): ProviderAdapter {
    const adapter = ProviderRegistry.adapters.get(providerId);
    if (!adapter) {
      throw new Error(
        `[ProviderRegistry] No hay adaptador registrado para providerId=${providerId}. ` +
          `Adaptadores disponibles: [${Array.from(ProviderRegistry.adapters.keys()).join(', ')}]`
      );
    }
    return adapter;
  }

  static getAll(): ProviderAdapter[] {
    return Array.from(ProviderRegistry.adapters.values());
  }

  static has(providerId: number): boolean {
    return ProviderRegistry.adapters.has(providerId);
  }

  static clear(): void {
    ProviderRegistry.adapters.clear();
  }
}
