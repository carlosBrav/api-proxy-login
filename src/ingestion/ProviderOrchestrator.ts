import { env } from '../config/env';
import { ProviderConnector } from '../providers/ProviderConnector';

/**
 * Arranca y detiene conectores según demanda de clientes WSS.
 * En el data plane actual (sin gateway WSS local) usar `startImmediately()`.
 */
export class ProviderOrchestrator {
  private activeClientCount = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly connectors: ProviderConnector[]) {}

  onClientConnected(): void {
    this.activeClientCount++;
    this.cancelIdleTimer();
    if (!this.isRunning) {
      console.log('[Orchestrator] Primer cliente. Iniciando proveedores...');
      void this.startAll();
    }
  }

  onClientDisconnected(): void {
    this.activeClientCount = Math.max(0, this.activeClientCount - 1);
    if (this.activeClientCount === 0) {
      console.log(
        `[Orchestrator] Sin clientes. Pausando en ${env.PROVIDER_IDLE_TIMEOUT_MS / 1000}s...`
      );
      this.scheduleIdleShutdown();
    }
  }

  /** Modo data plane: ingesta siempre activa hasta que exista gateway WSS local. */
  startImmediately(): void {
    if (!this.isRunning) {
      console.log('[Orchestrator] Inicio inmediato de proveedores (data plane).');
      void this.startAll();
    }
  }

  isProvidersRunning(): boolean {
    return this.isRunning;
  }

  getActiveClientCount(): number {
    return this.activeClientCount;
  }

  private async startAll(): Promise<void> {
    this.isRunning = true;
    for (const connector of this.connectors) {
      await connector.start().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Error iniciando "${connector.name}":`, message);
      });
    }
  }

  private async disposeAll(): Promise<void> {
    this.isRunning = false;
    for (const connector of this.connectors) {
      await connector.dispose().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Error desconectando "${connector.name}":`, message);
      });
    }
  }

  private scheduleIdleShutdown(): void {
    this.idleTimer = setTimeout(() => {
      if (this.activeClientCount === 0) {
        console.warn('[Orchestrator] Timeout de inactividad. Desconectando proveedores...');
        void this.disposeAll();
      }
    }, env.PROVIDER_IDLE_TIMEOUT_MS);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
