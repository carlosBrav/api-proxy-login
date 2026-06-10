export interface ProviderConnector {
  readonly name: string;
  start(): Promise<void>;
  dispose(): Promise<void>;
}
