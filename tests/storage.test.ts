import { describe, expect, it } from 'vitest';
import {
  emptyState,
  isOpened,
  loadState,
  markOpened,
  openedCount,
  parseStoredState,
  resetState,
  saveState,
  storageKey,
} from '../src/storage';
import { mockHass } from './mock-hass';

const KEY = 'advent_calendar_2026';
const NOW = new Date('2026-12-05T08:15:00Z');

describe('storageKey', () => {
  it('trennt Jahre und Testmodus', () => {
    expect(storageKey(2026, false)).toBe('advent_calendar_2026');
    expect(storageKey(2026, true)).toBe('advent_calendar_2026_test');
    expect(storageKey(2027, false)).toBe('advent_calendar_2027');
  });
});

describe('parseStoredState', () => {
  it('liefert für fehlende oder kaputte Daten einen leeren Stand', () => {
    for (const value of [null, undefined, 'x', 42, [], {}, { opened: [] }, { opened: null }]) {
      expect(parseStoredState(value), JSON.stringify(value)).toEqual(emptyState());
    }
  });

  it('übernimmt gültige Tage und verwirft ungültige', () => {
    const state = parseStoredState({
      version: 1,
      opened: { 1: '2026-12-01T07:00:00Z', 24: '2026-12-24T18:00:00Z', 0: 'x', 25: 'x', abc: 'x', 3: 5 },
    });
    expect(state.opened).toEqual({ 1: '2026-12-01T07:00:00Z', 24: '2026-12-24T18:00:00Z' });
    expect(isOpened(state, 1)).toBe(true);
    expect(isOpened(state, 3)).toBe(false);
    expect(openedCount(state)).toBe(2);
  });
});

describe('Laden und Speichern', () => {
  it('nutzt frontend/get_user_data und frontend/set_user_data', async () => {
    const hass = mockHass();
    await saveState(hass, KEY, { opened: { 2: '2026-12-02T09:00:00Z' } });

    expect(hass.calls[0]).toEqual({
      type: 'frontend/set_user_data',
      key: KEY,
      value: { version: 1, opened: { 2: '2026-12-02T09:00:00Z' } },
    });
    expect(await loadState(hass, KEY)).toEqual({ opened: { 2: '2026-12-02T09:00:00Z' } });
    expect(hass.calls[1]).toEqual({ type: 'frontend/get_user_data', key: KEY });
  });

  it('liefert ohne gespeicherte Daten einen leeren Stand', async () => {
    expect(await loadState(mockHass(), KEY)).toEqual(emptyState());
  });
});

describe('markOpened', () => {
  it('speichert ein neu geöffnetes Türchen mit Zeitpunkt', async () => {
    const hass = mockHass();
    const result = await markOpened(hass, KEY, 5, NOW);

    expect(result.newlyOpened).toBe(true);
    expect(result.state.opened).toEqual({ 5: '2026-12-05T08:15:00.000Z' });
    expect(await loadState(hass, KEY)).toEqual(result.state);
  });

  it('meldet ein schon geöffnetes Türchen und behält den ersten Zeitpunkt', async () => {
    const hass = mockHass({ userData: { [KEY]: { version: 1, opened: { 5: '2026-12-05T06:00:00Z' } } } });
    const result = await markOpened(hass, KEY, 5, NOW);

    expect(result.newlyOpened).toBe(false);
    expect(result.state.opened[5]).toBe('2026-12-05T06:00:00Z');
    expect(hass.calls.some((call) => call.type === 'frontend/set_user_data')).toBe(false);
  });

  it('übernimmt, was ein anderes Gerät inzwischen gespeichert hat', async () => {
    const hass = mockHass({ userData: { [KEY]: { version: 1, opened: { 4: '2026-12-04T07:00:00Z' } } } });
    const result = await markOpened(hass, KEY, 5, NOW);

    expect(Object.keys(result.state.opened)).toEqual(['4', '5']);
  });

  it('schreibt nicht in andere Jahre oder den Testmodus', async () => {
    const hass = mockHass();
    await markOpened(hass, storageKey(2026, true), 5, NOW);

    expect([...hass.userData.keys()]).toEqual(['advent_calendar_2026_test']);
  });
});

describe('resetState', () => {
  it('leert den Stand', async () => {
    const hass = mockHass({ userData: { [KEY]: { version: 1, opened: { 1: 'x', 2: 'y' } } } });
    expect(await resetState(hass, KEY)).toEqual(emptyState());
    expect(await loadState(hass, KEY)).toEqual(emptyState());
  });
});
