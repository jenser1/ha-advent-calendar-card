import { describe, expect, it } from 'vitest';
import { findCalendar, validatePersonConfig } from '../src/persons';
import { resolveTheme } from '../src/themes';
import type { AdventCalendarCardConfig } from '../src/types';

const TYPE = 'custom:advent-calendar-card';

const config = (rest: Omit<AdventCalendarCardConfig, 'type'>): AdventCalendarCardConfig => ({
  type: TYPE,
  ...rest,
});

const jens = { id: 'id-jens', name: 'Jens' };
const anna = { id: 'id-anna', name: 'Anna' };
const guest = { id: 'id-gast', name: 'Gast-Tablet' };

describe('findCalendar', () => {
  const family = config({
    users: {
      jens: { user_id: 'id-jens', theme: 'nerd', doors: { 1: { text: 'J' } } },
      anna: { theme: 'kids' },
    },
    fallback: { doors: { 1: { text: 'F' } } },
  });

  it('findet eine Person über die user_id', () => {
    expect(findCalendar(family, jens)).toEqual({
      person: 'jens',
      calendar: family.users!.jens,
    });
  });

  it('findet eine Person ohne user_id über den Benutzernamen', () => {
    expect(findCalendar(family, anna)?.person).toBe('anna');
    expect(findCalendar(family, { id: 'x', name: '  ANNA ' })?.person).toBe('anna');
  });

  it('bevorzugt die user_id vor dem Namen', () => {
    const tricky = config({
      users: {
        jens: {},
        papa: { user_id: 'id-jens' },
      },
    });
    expect(findCalendar(tricky, jens)?.person).toBe('papa');
  });

  it('ordnet Einträge mit user_id nicht über den Namen zu', () => {
    const other = { id: 'id-anderer-jens', name: 'Jens' };
    expect(findCalendar(family, other)).toEqual({ calendar: family.fallback });
  });

  it('nutzt den Fallback für Benutzer ohne Eintrag', () => {
    expect(findCalendar(family, guest)).toEqual({ calendar: family.fallback });
  });

  it('liefert nichts ohne Eintrag und ohne Fallback', () => {
    const noFallback = config({ users: { jens: { user_id: 'id-jens' } } });
    expect(findCalendar(noFallback, guest)).toBeUndefined();
  });

  it('zeigt ohne users allen denselben Kalender', () => {
    expect(findCalendar(config({}), guest)).toEqual({ calendar: {} });
    expect(findCalendar(config({ users: {} }), guest)).toEqual({ calendar: {} });
    expect(findCalendar(config({ fallback: { theme: 'kids' } }), guest)).toEqual({
      calendar: { theme: 'kids' },
    });
  });

  it('kommt mit leeren Einträgen aus dem YAML klar', () => {
    const empty = config({ users: { anna: null } });
    expect(findCalendar(empty, anna)).toEqual({ person: 'anna', calendar: {} });
  });
});

describe('Theme pro Person', () => {
  it('nimmt das Theme der Person, sonst das der Karte, sonst winter', () => {
    expect(resolveTheme('nerd', 'kids')).toBe('nerd');
    expect(resolveTheme(undefined, 'kids')).toBe('kids');
    expect(resolveTheme(undefined, undefined)).toBe('winter');
  });
});

describe('validatePersonConfig', () => {
  const invalid = (rest: Record<string, unknown>) => () =>
    validatePersonConfig({ type: TYPE, ...rest } as AdventCalendarCardConfig);

  it('akzeptiert eine vollständige Konfiguration', () => {
    expect(
      invalid({
        theme: 'winter',
        users: {
          jens: { user_id: 'id-jens', theme: 'nerd', doors: { 1: { text: 'x' }, 24: null } },
          anna: null,
          oma: { doors: null },
        },
        fallback: { theme: 'kids', doors: { 6: { text: 'Nikolaus' } } },
      }),
    ).not.toThrow();
    expect(invalid({})).not.toThrow();
  });

  it('prüft Themes', () => {
    expect(invalid({ theme: 'sommer' })).toThrow(/„theme“ muss eines davon sein: winter, kids, nerd/);
    expect(invalid({ users: { jens: { theme: 'blau' } } })).toThrow(/„users\.jens\.theme“/);
    expect(invalid({ fallback: { theme: 1 } })).toThrow(/„fallback\.theme“/);
  });

  it('prüft die Form von users', () => {
    expect(invalid({ users: ['jens'] })).toThrow(/„users“ muss Personen/);
    expect(invalid({ users: 'jens' })).toThrow(/„users“ muss Personen/);
    expect(invalid({ users: { jens: 'ja' } })).toThrow(/„users\.jens“ muss Einstellungen/);
  });

  it('prüft user_id', () => {
    expect(invalid({ users: { jens: { user_id: 42 } } })).toThrow(/„users\.jens\.user_id“/);
    expect(invalid({ users: { jens: { user_id: ' ' } } })).toThrow(/„users\.jens\.user_id“/);
    expect(
      invalid({ users: { jens: { user_id: 'a' }, papa: { user_id: 'a' } } }),
    ).toThrow(/„users\.papa\.user_id“ ist schon „users\.jens“ zugeordnet/);
  });

  it('prüft die Türchen-Nummern und Inhalte', () => {
    expect(invalid({ users: { jens: { doors: { 25: {} } } } })).toThrow(/„25“ ist kein Türchen/);
    expect(invalid({ users: { jens: { doors: { 0: {} } } } })).toThrow(/„0“ ist kein Türchen/);
    expect(invalid({ fallback: { doors: { erster: {} } } })).toThrow(/„erster“ ist kein Türchen/);
    expect(invalid({ users: { jens: { doors: [] } } })).toThrow(/„users\.jens\.doors“ muss Türchen/);
    expect(invalid({ users: { jens: { doors: { 1: 'Hallo' } } } })).toThrow(
      /„users\.jens\.doors\.1“ muss Inhalte/,
    );
  });
});
