/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import {
  communityDoors,
  validateCommunityCalendar,
  validateCommunityConfig,
} from '../src/content-source';
import type { AdventCalendarCardConfig } from '../src/types';

// Beispielinhalt (im Repo) und – falls vorhanden – die echten Inhalte (nicht im Repo).
const contentFiles = import.meta.glob<unknown>('../content/*.json', { eager: true, import: 'default' });

const TYPE = 'custom:advent-calendar-card';
const CALENDAR = { year: 2026, doors: {} };

describe('Inhalte der Community-Edition', () => {
  it.each(Object.keys(contentFiles))('%s ist gültig', (file) => {
    expect(() => validateCommunityCalendar(contentFiles[file])).not.toThrow();
  });

  it('liefert Jahr und Türchen', () => {
    expect(validateCommunityCalendar({ year: 2026, doors: { 1: { text: 'Hallo' } } })).toEqual({
      year: 2026,
      doors: { 1: { text: 'Hallo' } },
    });
    expect(validateCommunityCalendar({ year: 2026 })).toEqual({ year: 2026, doors: {} });
  });

  it.each([
    [[], 'Objekt'],
    [{ doors: {} }, '„year“ muss eine Jahreszahl sein'],
    [{ year: '2026', doors: {} }, '„year“ muss eine Jahreszahl sein'],
    [{ year: 2026, users: {} }, '„users“ gibt es nicht, erlaubt sind „year“ und „doors“.'],
    [{ year: 2026, doors: { 25: { text: 'zu spät' } } }, '„25“ ist kein Türchen'],
    [{ year: 2026, doors: { 3: { foo: 'bar' } } }, 'doors.3.foo'],
  ])('lehnt Fehler verständlich ab (%#)', (data, message) => {
    expect(() => validateCommunityCalendar(data)).toThrow(message);
  });

  it('verbietet Effekte', () => {
    expect(() =>
      validateCommunityCalendar({ year: 2026, doors: { 4: { text: 'Licht!', effect: { action: 'light.turn_on' } } } }),
    ).toThrow('„doors.4.effect“: Effekte sind in Community-Inhalten nicht erlaubt.');
  });

  it('entfernt Effekte zur Sicherheit auch beim Anzeigen', () => {
    const doors = communityDoors({
      year: 2026,
      doors: { 1: { text: 'Eins', effect: { action: 'light.turn_on' } }, 2: null },
    });
    expect(doors).toEqual({ 1: { text: 'Eins' }, 2: null });
  });
});

describe('Gesperrte Optionen', () => {
  const config = (extra: Partial<AdventCalendarCardConfig>): AdventCalendarCardConfig => ({
    type: TYPE,
    ...extra,
  });

  it('erlaubt Überschrift, Theme, Schnee, Mischen, Leertext und Testdatum', () => {
    expect(() =>
      validateCommunityConfig(
        config({ title: 'Advent', theme: 'kids', snow: true, shuffle: false, empty_text: 'Leer', debug_date: '2026-12-05' }),
        CALENDAR,
      ),
    ).not.toThrow();
  });

  it.each(['users', 'fallback', 'shared', 'content_source', 'json_path'] as const)(
    'lehnt %s ab und verweist auf das nächste Jahr',
    (key) => {
      expect(() => validateCommunityConfig(config({ [key]: {} }), CALENDAR)).toThrow(
        `„${key}“ gibt es in der Community-Edition 2026 noch nicht – eigene Kalender kommen 2027.`,
      );
    },
  );

  it('lehnt year ab', () => {
    expect(() => validateCommunityConfig(config({ year: 2027 }), CALENDAR)).toThrow(
      'sie zeigt immer den Kalender 2026',
    );
  });
});
