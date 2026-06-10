import { LiveGamesTablePatch } from './LiveGamesTablePatch';

/**
 * RealtimePatchMessage — Envoltorio de transporte para el endpoint REST
 * y los mensajes WebSocket enviados al cliente.
 */
export interface RealtimePatchMessage {
  /** Tipo del mensaje: siempre "patch" para actualizaciones de live games */
  type: 'patch';

  /** Versión del último parche procesado (timestamp ISO-8601) */
  version: string;

  /** Hora del servidor al momento de armar la respuesta */
  serverTime: string;

  /** Array de parches de mesas con datos actualizados */
  updates: LiveGamesTablePatch[];
}
