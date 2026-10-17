import { DOOR_COUNT } from './date-logic';
import type { HomeAssistant } from './types';

/** Stand eines Kalenders für einen Benutzer und ein Jahr. */
export interface CalendarState {
  /** Tag → Zeitpunkt des ersten Öffnens (ISO-Zeitstempel). */
  opened: Record<number, string>;
}

const STORAGE_VERSION = 1;

/**
 * Schlüssel für frontend/get_user_data bzw. set_user_data. HA speichert diese
 * Daten pro Benutzer auf dem Server, sie gelten also auf allen Geräten.
 * Im Testmodus wird ein eigener Schlüssel genutzt, damit echte Daten unberührt bleiben.
 */
export function storageKey(year: number, test: boolean): string {
  return `advent_calendar_${year}${test ? '_test' : ''}`;
}

export function emptyState(): CalendarState {
  return { opened: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Wandelt gespeicherte Daten in einen gültigen Stand um; Ungültiges wird verworfen. */
export function parseStoredState(value: unknown): CalendarState {
  const state = emptyState();
  if (!isRecord(value) || !isRecord(value.opened)) {
    return state;
  }
  for (const [key, openedAt] of Object.entries(value.opened)) {
    const day = Number(key);
    if (Number.isInteger(day) && day >= 1 && day <= DOOR_COUNT && typeof openedAt === 'string') {
      state.opened[day] = openedAt;
    }
  }
  return state;
}

export function isOpened(state: CalendarState, day: number): boolean {
  return day in state.opened;
}

export function openedCount(state: CalendarState): number {
  return Object.keys(state.opened).length;
}

export async function loadState(hass: HomeAssistant, key: string): Promise<CalendarState> {
  const result = await hass.callWS<{ value: unknown } | null>({
    type: 'frontend/get_user_data',
    key,
  });
  return parseStoredState(result?.value);
}

export async function saveState(
  hass: HomeAssistant,
  key: string,
  state: CalendarState,
): Promise<void> {
  await hass.callWS({
    type: 'frontend/set_user_data',
    key,
    value: { version: STORAGE_VERSION, opened: state.opened },
  });
}

/**
 * Markiert ein Türchen als geöffnet. Liest vorher den aktuellen Stand vom Server,
 * damit Änderungen von anderen Geräten nicht überschrieben werden. `newlyOpened`
 * ist false, wenn das Türchen schon (z. B. auf einem anderen Gerät) geöffnet war.
 */
export async function markOpened(
  hass: HomeAssistant,
  key: string,
  day: number,
  now: Date,
): Promise<{ state: CalendarState; newlyOpened: boolean }> {
  const current = await loadState(hass, key);
  if (isOpened(current, day)) {
    return { state: current, newlyOpened: false };
  }
  const state = { opened: { ...current.opened, [day]: now.toISOString() } };
  await saveState(hass, key, state);
  return { state, newlyOpened: true };
}

export async function resetState(hass: HomeAssistant, key: string): Promise<CalendarState> {
  const state = emptyState();
  await saveState(hass, key, state);
  return state;
}
