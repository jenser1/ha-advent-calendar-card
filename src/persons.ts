import { validateDoorContent } from './blocks';
import { DOOR_COUNT } from './date-logic';
import { THEMES, isThemeName } from './themes';
import type {
  AdventCalendarCardConfig,
  CalendarConfig,
  DoorContent,
  SharedMode,
} from './types';

export interface CalendarMatch {
  /** Schlüssel aus `users`; undefined für den Fallback bzw. eine Karte ohne `users`. */
  person?: string;
  calendar: CalendarConfig;
}

/** Was hinter einem Türchen steckt: persönlicher und/oder gemeinsamer Inhalt. */
export interface ResolvedDoor {
  personal?: DoorContent;
  shared?: DoorContent;
}

export const SHARED_MODES: readonly SharedMode[] = ['off', 'merge', 'replace'];
const DEFAULT_SHARED_MODE: SharedMode = 'merge';

/**
 * Sucht den Kalender für den angemeldeten Benutzer:
 * 1. Eintrag mit passender `user_id`
 * 2. Eintrag ohne `user_id`, dessen Schlüssel dem Benutzernamen entspricht (ohne Groß-/Kleinschreibung)
 * 3. `fallback`
 *
 * Ohne `users` sehen alle denselben Kalender (`fallback`, falls gesetzt).
 * undefined heißt: Für diesen Benutzer gibt es keinen Kalender.
 */
export function findCalendar(
  config: AdventCalendarCardConfig,
  user: { id: string; name: string } | undefined,
): CalendarMatch | undefined {
  const fallback = config.fallback ? { calendar: config.fallback } : undefined;
  const entries = Object.entries(config.users ?? {});
  if (entries.length === 0) {
    return fallback ?? { calendar: {} };
  }
  if (!user) {
    return fallback;
  }

  const byId = entries.find(([, person]) => person?.user_id === user.id);
  if (byId) {
    return { person: byId[0], calendar: byId[1] ?? {} };
  }
  const name = user.name.trim().toLowerCase();
  const byName = entries.find(
    ([key, person]) => !person?.user_id && key.trim().toLowerCase() === name,
  );
  if (byName) {
    return { person: byName[0], calendar: byName[1] ?? {} };
  }
  return fallback;
}

/**
 * Kombiniert persönlichen und gemeinsamen Inhalt eines Türchens nach dem Modus
 * (pro Türchen über `mode`, sonst `shared.mode`, Standard merge).
 */
export function resolveDoor(
  config: AdventCalendarCardConfig,
  calendar: CalendarConfig,
  day: number,
): ResolvedDoor {
  const personal = calendar.doors?.[day] ?? undefined;
  const sharedDoor = config.shared?.doors?.[day] ?? undefined;
  const mode = sharedDoor?.mode ?? config.shared?.mode ?? DEFAULT_SHARED_MODE;
  if (!sharedDoor || mode === 'off') {
    return { personal };
  }
  const { mode: _mode, ...shared } = sharedDoor;
  return mode === 'replace' ? { shared } : { personal, shared };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const THEME_LIST = THEMES.join(', ');
const MODE_LIST = SHARED_MODES.join(', ');

function validateDoors(doors: unknown, path: string, allowMode: boolean): void {
  if (doors == null) {
    return;
  }
  if (!isRecord(doors)) {
    throw new Error(`„${path}“ muss Türchen in der Form „1: { … }“ enthalten.`);
  }
  for (const [key, content] of Object.entries(doors)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 1 || day > DOOR_COUNT) {
      throw new Error(`„${path}“: „${key}“ ist kein Türchen, erlaubt sind 1 bis ${DOOR_COUNT}.`);
    }
    if (content == null) {
      continue;
    }
    if (!isRecord(content)) {
      throw new Error(`„${path}.${key}“ muss Inhalte enthalten, z. B. „text: …“.`);
    }
    const { mode, ...blocks } = content;
    if (allowMode && mode !== undefined && !SHARED_MODES.includes(mode as SharedMode)) {
      throw new Error(`„${path}.${key}.mode“ muss eines davon sein: ${MODE_LIST}.`);
    }
    validateDoorContent(allowMode ? blocks : content, `${path}.${key}`);
  }
}

function validateCalendar(value: unknown, path: string): void {
  if (value == null) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`„${path}“ muss Einstellungen enthalten, z. B. „theme“ oder „doors“.`);
  }
  if (value.theme !== undefined && !isThemeName(value.theme)) {
    throw new Error(`„${path}.theme“ muss eines davon sein: ${THEME_LIST}.`);
  }
  validateDoors(value.doors, `${path}.doors`, false);
}

function validateShared(value: unknown): void {
  if (value == null) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error('„shared“ muss Einstellungen enthalten, z. B. „mode“ und „doors“.');
  }
  const allowed = ['mode', 'effect_once', 'effect_helper', 'doors'];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new Error(`„shared.${unknown}“ gibt es nicht. Möglich sind: ${allowed.join(', ')}.`);
  }
  if (value.mode !== undefined && !SHARED_MODES.includes(value.mode as SharedMode)) {
    throw new Error(`„shared.mode“ muss eines davon sein: ${MODE_LIST}.`);
  }
  if (value.effect_once !== undefined && typeof value.effect_once !== 'boolean') {
    throw new Error('„shared.effect_once“ muss true oder false sein.');
  }
  if (
    value.effect_helper !== undefined &&
    (typeof value.effect_helper !== 'string' || !/^input_text\.[a-z0-9_]+$/.test(value.effect_helper))
  ) {
    throw new Error(
      '„shared.effect_helper“ muss ein Text-Helfer sein, z. B. input_text.adventskalender.',
    );
  }
  validateDoors(value.doors, 'shared.doors', true);
}

/** Prüft theme, users, fallback und shared; wirft bei Fehlern eine verständliche Meldung. */
export function validatePersonConfig(config: AdventCalendarCardConfig): void {
  if (config.theme !== undefined && !isThemeName(config.theme)) {
    throw new Error(`„theme“ muss eines davon sein: ${THEME_LIST}.`);
  }

  const users: unknown = config.users;
  if (users != null) {
    if (!isRecord(users)) {
      throw new Error('„users“ muss Personen in der Form „name: { … }“ enthalten.');
    }
    const seenIds = new Map<string, string>();
    for (const [key, person] of Object.entries(users)) {
      const path = `users.${key}`;
      validateCalendar(person, path);
      const userId = isRecord(person) ? person.user_id : undefined;
      if (userId === undefined) {
        continue;
      }
      if (typeof userId !== 'string' || userId.trim() === '') {
        throw new Error(`„${path}.user_id“ muss die ID eines HA-Benutzers sein.`);
      }
      const other = seenIds.get(userId);
      if (other) {
        throw new Error(`„${path}.user_id“ ist schon „users.${other}“ zugeordnet.`);
      }
      seenIds.set(userId, key);
    }
  }

  validateCalendar(config.fallback, 'fallback');
  validateShared(config.shared);
}
