import type { ThemeName } from './themes';

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
  /** Standard-Theme für alle Personen. */
  theme?: ThemeName;
  /** Text im Dialog, wenn für ein Türchen kein Inhalt eingetragen ist. */
  empty_text?: string;
  /** Personen, Schlüssel ist ein frei wählbarer Name. Ein leerer Eintrag (`anna:`) ist null. */
  users?: Record<string, PersonConfig | null>;
  /** Kalender für alle ohne eigenen Eintrag in `users`. */
  fallback?: CalendarConfig | null;
}

export type LinkKind = 'github' | 'video' | 'shop' | 'web';

export interface LinkBlock {
  url: string;
  title?: string;
  description?: string;
  /** Standard: web */
  kind?: LinkKind;
}

/** Inhalt eines Türchens; die Bausteine erscheinen in der Reihenfolge aus der YAML. */
export interface DoorContent {
  /** Spruch, Rätsel oder Fakt. */
  text?: string;
  /** Lösung zum Rätsel in `text`, hinter einem „Lösung zeigen“-Button. */
  answer?: string;
  /** Bild oder GIF (/local/... oder https://...). */
  image?: string;
  /** Mini-Aufgabe oder Gutschein mit „Erledigt“-Haken. */
  task?: string;
  link?: string | LinkBlock;
  /** YouTube-Link oder eigene Videodatei. */
  video?: string;
  /** Service-Call beim ersten Öffnen. */
  effect?: Record<string, unknown>;
}

export interface CalendarConfig {
  theme?: ThemeName;
  /** Türchen 1–24; ein leerer Eintrag (`3:`) ist null. */
  doors?: Record<number, DoorContent | null> | null;
}

export interface PersonConfig extends CalendarConfig {
  /** Feste Zuordnung zu einem HA-Benutzer; ohne sie zählt der Benutzername. */
  user_id?: string;
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
