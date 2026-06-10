/**
 * LiveGamesTablePatch — Contrato canónico ÚNICO de datos en tiempo real.
 *
 * Esta interfaz representa la estructura estándar que el BFF envía
 * al cliente frontend (acity-col) independientemente del proveedor
 * de origen (Evolution, Pragmatic, Playtech, Ezugi, etc.) y del
 * tipo de juego (Ruleta, Baccarat, Blackjack, Game Shows, Crash).
 *
 * REGLAS ESTRICTAS:
 * - Prohibido incluir metadatos estáticos (logos, nombres, configuraciones de máquina).
 * - La key de cruce con el frontend es exclusivamente `external_id`.
 * - El frontend descarta updates de IDs no presentes en su Fase A (Calímaco).
 * - Los campos opcionales dentro de `realtime` se omiten si no aplican
 *   al tipo de juego (ej: `availableSeats` solo para Blackjack clásico).
 */
export interface LiveGamesTablePatch {
  /** ID de cruce único con Calímaco getLiveGames (join key con el frontend) */
  external_id: string;

  /** ID numérico del proveedor asignado por plataforma (obligatorio en prod) */
  idProveedor: number;

  /** Datos de tiempo real de la mesa */
  realtime: {
    /** Límite mínimo de apuesta actual de la mesa */
    minBet?: number;

    /** Límite máximo de apuesta actual de la mesa */
    maxBet?: number;

    /** Código ISO-4217 de la moneda (ej: "COP", "USD", "EUR") */
    currency?: string;

    /**
     * Asientos físicos libres disponibles.
     * Solo aplica para Blackjack clásico con asientos individuales (típicamente 0-7).
     * Para Ruleta, Baccarat, One Blackjack, Game Shows y Crash: se omite (undefined).
     */
    availableSeats?: number;

    /** Si la mesa está abierta y disponible para recibir apuestas */
    isAvailable?: boolean;

    /** Si la ventana de apuestas está abierta */
    bettingOpen?: boolean;

    /** Jugadores conectados en la mesa */
    playersOnline?: number;

    /** Timestamp ISO-8601 UTC del momento de procesamiento del parche */
    updatedAt: string;
  };
}
