/** Der Teil des `hass`-Objekts von Home Assistant, den die Karte nutzt. */
export interface HomeAssistant {
  user?: {
    id: string;
    name: string;
    is_admin: boolean;
  };
  config: {
    time_zone: string;
  };
  language: string;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
}

export interface AdventCalendarCardConfig {
  type: string;
  /** Überschrift der Karte. Leerer String blendet sie aus. */
  title?: string;
  /** Kalenderjahr; Standard ist das aktuelle Jahr. */
  year?: number;
  /**
   * Testdatum (JJJJ-MM-TT), wirkt nur für Admins. Kann ein Date sein,
   * weil der YAML-Editor von HA Datumswerte als Date einliest.
   */
  debug_date?: string | Date;
}

/** Eintrag für den Karten-Picker im Dashboard-Editor. */
export interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}
