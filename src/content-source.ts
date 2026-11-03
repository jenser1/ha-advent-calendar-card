import { validateDoors } from './persons';
import type {
  AdventCalendarCardConfig,
  CalendarConfig,
  ContentSource,
  DoorContent,
  SharedDoorContent,
} from './types';

export const CONTENT_SOURCES: readonly ContentSource[] = ['yaml', 'json'];
export const DEFAULT_JSON_PATH = '/local/advent/{person}.json';

/** Dateinamen ({person}) für den Fallback-Kalender und die gemeinsamen Türchen. */
export const FALLBACK_FILE = 'fallback';
export const SHARED_FILE = 'shared';
const RESERVED_NAMES = [FALLBACK_FILE, SHARED_FILE];

export type Doors<T extends DoorContent = DoorContent> = Record<number, T | null>;

/** Eine Inhaltsdatei: `path` zum Anzeigen, `url` zum Laden (Name URL-kodiert). */
export interface ContentFile {
  path: string;
  url: string;
}

export type FileContent<T extends DoorContent = DoorContent> = { path: string } & (
  | { status: 'ok'; doors: Doors<T> }
  | { status: 'missing' }
  | { status: 'error'; message: string }
);

/** Türchen einer Person bzw. des Fallbacks und die gemeinsamen Türchen. */
export interface CalendarContent {
  personal: FileContent;
  shared: FileContent<SharedDoorContent>;
}

export function usesJson(config: AdventCalendarCardConfig): boolean {
  return config.content_source === 'json';
}

/** Name für {person}: Schlüssel aus `users`, für den Fallback bzw. ohne `users` „fallback“. */
export function fileName(person: string | undefined): string {
  return person ?? FALLBACK_FILE;
}

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.includes(name.trim().toLowerCase());
}

export function contentFile(config: AdventCalendarCardConfig, name: string, year: number): ContentFile {
  const template = config.json_path || DEFAULT_JSON_PATH;
  const fill = (person: string) =>
    template.replaceAll('{person}', person).replaceAll('{year}', String(year));
  return { path: fill(name), url: fill(encodeURIComponent(name)) };
}

/** Ordner auf dem HA-Server für Pfade unter /local/ (das ist /config/www/). */
export function serverPath(path: string): string | undefined {
  return path.startsWith('/local/') ? `/config/www/${path.slice('/local/'.length)}` : undefined;
}

/** Fehlermeldung für einen ungültigen `json_path`, sonst undefined. */
export function jsonPathError(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    !value.includes('{person}')
  ) {
    return '„json_path“ muss mit / beginnen und {person} enthalten, z. B. /local/advent/{person}.json.';
  }
  return undefined;
}

/** Prüft content_source, json_path und im JSON-Modus die reservierten Personen-Namen. */
export function validateContentConfig(config: AdventCalendarCardConfig): void {
  if (config.content_source !== undefined && !CONTENT_SOURCES.includes(config.content_source)) {
    throw new Error(`„content_source“ muss eines davon sein: ${CONTENT_SOURCES.join(', ')}.`);
  }
  if (config.json_path !== undefined) {
    const error = jsonPathError(config.json_path);
    if (error) {
      throw new Error(error);
    }
  }
  if (usesJson(config)) {
    const reserved = Object.keys(config.users ?? {}).find(isReservedName);
    if (reserved) {
      throw new Error(
        `„users.${reserved}“: Mit content_source: json sind die Namen „${FALLBACK_FILE}“ und „${SHARED_FILE}“ für die Dateien des Fallbacks und der gemeinsamen Türchen reserviert.`,
      );
    }
  }
}

/** Prüft den Inhalt einer Datei ({ "doors": { … } }) und gibt die Türchen zurück. */
export function parseContentFile<T extends DoorContent>(data: unknown, allowMode: boolean): Doors<T> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Die Datei muss ein Objekt sein, z. B. { "doors": { "1": { "text": "…" } } }.');
  }
  const unknown = Object.keys(data).find((key) => key !== 'doors');
  if (unknown) {
    throw new Error(`„${unknown}“ gibt es in der Datei nicht, erlaubt ist nur „doors“.`);
  }
  const doors = (data as { doors?: unknown }).doors;
  validateDoors(doors, 'doors', allowMode);
  return (doors ?? {}) as Doors<T>;
}

/** Lädt eine Datei frisch vom Server (ohne veralteten Cache) und prüft sie. */
export async function loadContentFile<T extends DoorContent>(
  file: ContentFile,
  allowMode: boolean,
): Promise<FileContent<T>> {
  const { path } = file;
  let response: Response;
  try {
    response = await fetch(file.url, { cache: 'no-cache', credentials: 'same-origin' });
  } catch {
    return { path, status: 'error', message: `„${path}“ konnte nicht geladen werden.` };
  }
  if (response.status === 404) {
    return { path, status: 'missing' };
  }
  if (!response.ok) {
    return {
      path,
      status: 'error',
      message: `„${path}“ konnte nicht geladen werden (HTTP ${response.status}).`,
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch (err) {
    const detail = err instanceof Error ? ` (${err.message})` : '';
    return { path, status: 'error', message: `„${path}“ ist kein gültiges JSON${detail}.` };
  }
  try {
    return { path, status: 'ok', doors: parseContentFile<T>(data, allowMode) };
  } catch (err) {
    return { path, status: 'error', message: `Fehler in „${path}“: ${(err as Error).message}` };
  }
}

/** Lädt die Datei der Person (oder des Fallbacks) und die der gemeinsamen Türchen. */
export async function loadCalendarContent(
  config: AdventCalendarCardConfig,
  person: string | undefined,
  year: number,
): Promise<CalendarContent> {
  const [personal, shared] = await Promise.all([
    loadContentFile(contentFile(config, fileName(person), year), false),
    loadContentFile<SharedDoorContent>(contentFile(config, SHARED_FILE, year), true),
  ]);
  return { personal, shared };
}

/**
 * Alles da? Die Datei der gemeinsamen Türchen ist freiwillig – fehlt sie,
 * gibt es eben keine. Unvollständiges wird beim nächsten Prüfen erneut geladen.
 */
export function isComplete(content: CalendarContent): boolean {
  return content.personal.status === 'ok' && content.shared.status !== 'error';
}

export function doorsOf<T extends DoorContent>(file: FileContent<T> | undefined): Doors<T> | undefined {
  return file?.status === 'ok' ? file.doors : undefined;
}

/**
 * Im JSON-Modus kommen die Türchen aus den Dateien; Türchen in der YAML werden
 * dann ignoriert. Solange nichts geladen ist, sind alle Türchen leer.
 */
export function withFileDoors(
  config: AdventCalendarCardConfig,
  calendar: CalendarConfig,
  content: Partial<CalendarContent> | undefined,
): { config: AdventCalendarCardConfig; calendar: CalendarConfig } {
  if (!usesJson(config)) {
    return { config, calendar };
  }
  return {
    config: { ...config, shared: { ...(config.shared ?? {}), doors: doorsOf(content?.shared) } },
    calendar: { ...calendar, doors: doorsOf(content?.personal) },
  };
}

/** Datei-Inhalt zum Herunterladen: leere Türchen fallen weg, Reihenfolge 1–24. */
export function toContentJson(doors: Doors<SharedDoorContent> | null | undefined): string {
  const entries = Object.entries(doors ?? {})
    .filter(([, content]) => content != null)
    .sort(([a], [b]) => Number(a) - Number(b));
  return `${JSON.stringify({ doors: Object.fromEntries(entries) }, null, 2)}\n`;
}
