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
  /** Zustände aller Entitäten, Schlüssel ist die entity_id. */
  states?: Record<string, { state: string; attributes?: Record<string, unknown> }>;
  /** Verfügbare Dienste: domain → service → Beschreibung. */
  services?: Record<string, Record<string, unknown>>;
  /** darkMode: HA zeigt gerade das dunkle Design. */
  themes?: { darkMode?: boolean };
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
    /** false: HA zeigt bei Fehlern keinen eigenen Toast. */
    notifyOnError?: boolean,
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
  /** Schneefall über der Karte (Standard: aus). */
  snow?: boolean;
  /** Türchen pro Person fest gemischt (Standard: an). */
  shuffle?: boolean;
  /** Kerzen neben dem Video an den Adventssonntagen (Standard: an). */
  advent_candles?: boolean;
  /** Text im Dialog, wenn für ein Türchen kein Inhalt eingetragen ist. */
  empty_text?: string;
  /**
   * Eigener Effekt beim ersten Öffnen jedes Türchens (freiwillig, auch in der
   * Community-Edition). Scripts bekommen tag und person mit.
   */
  effect?: EffectConfig;
  /** Einfacher Lichteffekt bei jedem Türchen (im Editor ohne YAML einstellbar). */
  effect_light?: LightEffectConfig;
  /** Einfache Musik beim Öffnen, auf Wunsch nur an bestimmten Türchen. */
  effect_music?: MusicEffectConfig;
  /** Woher die Türchen kommen: aus dieser Config (Standard) oder aus JSON-Dateien. */
  content_source?: ContentSource;
  /** Pfad der JSON-Dateien mit {person} und optional {year}; Standard /local/advent/{person}.json. */
  json_path?: string;
  /** Personen, Schlüssel ist ein frei wählbarer Name. Ein leerer Eintrag (`anna:`) ist null. */
  users?: Record<string, PersonConfig | null>;
  /** Kalender für alle ohne eigenen Eintrag in `users`. */
  fallback?: CalendarConfig | null;
  /** Gemeinsame Türchen für alle Personen. */
  shared?: SharedConfig | null;
}

export type ContentSource = 'yaml' | 'json';

/**
 * off: nur persönliche Inhalte; merge: gemeinsamer Inhalt zusätzlich zum persönlichen;
 * replace: alle sehen nur den gemeinsamen Inhalt.
 */
export type SharedMode = 'off' | 'merge' | 'replace';

export interface SharedConfig {
  /** Standard: merge */
  mode?: SharedMode;
  /** Gemeinsamer Effekt nur einmal pro Tag (Standard: true); braucht effect_helper. */
  effect_once?: boolean;
  /** input_text-Helfer, in dem sich die Karte merkt, dass der Effekt heute schon lief. */
  effect_helper?: string;
  doors?: Record<number, SharedDoorContent | null> | null;
}

export interface SharedDoorContent extends DoorContent {
  /** Überschreibt shared.mode für dieses Türchen. */
  mode?: SharedMode;
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
  /** Ein oder mehrere Service-Aufrufe beim ersten Öffnen. */
  effect?: EffectConfig;
}

export interface EffectCall {
  /** „domain.service“, z. B. script.turn_on; `service` ist die ältere Schreibweise. */
  action?: string;
  service?: string;
  data?: Record<string, unknown>;
  target?: Record<string, string | string[]>;
  /** false: Aufruf ist abgeschaltet (schreibt HAs Aktions-Editor). */
  enabled?: boolean;
  /** Weitere Felder aus HAs Aktions-Editor; werden ignoriert. */
  metadata?: Record<string, unknown>;
  alias?: string;
  continue_on_error?: boolean;
}

export type EffectConfig = EffectCall | EffectCall[];

/** flash: Lampe kurz aufblinken lassen; effect: einen Lichteffekt der Lampe starten (effect_list). */
export type LightMode = 'flash' | 'effect';

export interface LightEffectConfig {
  /** Lampe, z. B. light.wohnzimmer; ohne Lampe passiert nichts. */
  entity_id?: string;
  /** Standard: flash. */
  mode?: LightMode;
  /** Name des Lichteffekts bei mode: effect, z. B. „Rainbow“. */
  effect?: string;
  /** Sekunden, nach denen die Lampe wie vorher ist (nur bei mode: effect); ohne Angabe läuft der Effekt weiter. */
  duration?: number;
}

/** music_assistant: Titel/Name über Music Assistant; media_player: Datei- oder Stream-Adresse. */
export type MusicPlayer = 'music_assistant' | 'media_player';

export interface MusicEffectConfig {
  /** Mediaplayer, z. B. media_player.wohnzimmer; ohne Player oder Titel passiert nichts. */
  entity_id?: string;
  /** Standard: media_player. */
  player?: MusicPlayer;
  /** Titel (Music Assistant) oder Adresse der Datei/des Streams. */
  media_id?: string;
  /** Art des Mediums für den Mediaplayer (media_content_type), z. B. audio/mpeg; Standard: music. Setzt die Medienauswahl im Editor. */
  media_type?: string;
  /** Lautstärke in Prozent (0–100); leer lässt sie, wie sie ist. */
  volume?: number;
  /** Nur an diesen Türchen (1–24); leer = an jedem Türchen. */
  days?: number[];
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
