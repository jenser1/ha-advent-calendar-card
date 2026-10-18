import { validateDoorContent } from './blocks';
import { DOOR_COUNT } from './date-logic';
import { THEMES, isThemeName } from './themes';
import type { AdventCalendarCardConfig, CalendarConfig } from './types';

export interface CalendarMatch {
  /** Schlüssel aus `users`; undefined für den Fallback bzw. eine Karte ohne `users`. */
  person?: string;
  calendar: CalendarConfig;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const THEME_LIST = THEMES.join(', ');

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
  const doors = value.doors;
  if (doors == null) {
    return;
  }
  if (!isRecord(doors)) {
    throw new Error(`„${path}.doors“ muss Türchen in der Form „1: { … }“ enthalten.`);
  }
  for (const [key, content] of Object.entries(doors)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 1 || day > DOOR_COUNT) {
      throw new Error(`„${path}.doors“: „${key}“ ist kein Türchen, erlaubt sind 1 bis ${DOOR_COUNT}.`);
    }
    if (content == null) {
      continue;
    }
    if (!isRecord(content)) {
      throw new Error(`„${path}.doors.${key}“ muss Inhalte enthalten, z. B. „text: …“.`);
    }
    validateDoorContent(content, `${path}.doors.${key}`);
  }
}

/** Prüft theme, users und fallback; wirft bei Fehlern eine verständliche Meldung. */
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
}
