import { describe, expect, it } from 'vitest';
import { findCalendar, resolveDoor, validatePersonConfig } from '../src/persons';
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

describe('resolveDoor (gemeinsame Türchen)', () => {
  const personal = { doors: { 6: { text: 'Für Jens' }, 7: { text: 'Nur Jens' } } };
  const withShared = (shared: AdventCalendarCardConfig['shared']) => config({ shared });

  it('führt im Standard-Modus merge beides zusammen', () => {
    const cfg = withShared({ doors: { 6: { text: 'Für alle' } } });
    expect(resolveDoor(cfg, personal, 6)).toEqual({
      personal: { text: 'Für Jens' },
      shared: { text: 'Für alle' },
    });
    expect(resolveDoor(cfg, personal, 7)).toEqual({ personal: { text: 'Nur Jens' } });
  });

  it('zeigt bei replace nur den gemeinsamen Inhalt', () => {
    const cfg = withShared({ mode: 'replace', doors: { 6: { text: 'Für alle' } } });
    expect(resolveDoor(cfg, personal, 6)).toEqual({ shared: { text: 'Für alle' } });
  });

  it('ignoriert gemeinsame Türchen bei off', () => {
    const cfg = withShared({ mode: 'off', doors: { 6: { text: 'Für alle' } } });
    expect(resolveDoor(cfg, personal, 6)).toEqual({ personal: { text: 'Für Jens' } });
  });

  it('lässt einzelne Türchen den Modus überschreiben und entfernt mode aus dem Inhalt', () => {
    const cfg = withShared({
      mode: 'merge',
      doors: {
        6: { mode: 'replace', text: 'Nikolaus für alle' },
        7: { mode: 'off', text: 'heute nicht' },
      },
    });
    expect(resolveDoor(cfg, personal, 6)).toEqual({ shared: { text: 'Nikolaus für alle' } });
    expect(resolveDoor(cfg, personal, 7)).toEqual({ personal: { text: 'Nur Jens' } });

    const globalOff = withShared({ mode: 'off', doors: { 24: { mode: 'merge', text: 'Heiligabend' } } });
    expect(resolveDoor(globalOff, {}, 24)).toEqual({ personal: undefined, shared: { text: 'Heiligabend' } });
  });

  it('kommt ohne shared und mit leeren Einträgen klar', () => {
    expect(resolveDoor(config({}), personal, 6)).toEqual({ personal: { text: 'Für Jens' } });
    expect(resolveDoor(withShared({ doors: { 6: null } }), {}, 6)).toEqual({ personal: undefined });
  });
});

describe('validatePersonConfig: shared', () => {
  const check = (shared: unknown) => () =>
    validatePersonConfig({ type: TYPE, shared } as AdventCalendarCardConfig);

  it('akzeptiert eine vollständige Konfiguration', () => {
    expect(
      check({
        mode: 'merge',
        effect_once: true,
        effect_helper: 'input_text.adventskalender',
        doors: {
          6: { mode: 'replace', text: 'Nikolaus!', effect: { action: 'script.advent_nikolaus' } },
          24: null,
        },
      }),
    ).not.toThrow();
    expect(check(null)).not.toThrow();
  });

  it('meldet falsche Einstellungen', () => {
    expect(check('merge')).toThrow(/„shared“ muss Einstellungen/);
    expect(check({ modus: 'merge' })).toThrow(/„shared\.modus“ gibt es nicht/);
    expect(check({ mode: 'mix' })).toThrow(/„shared\.mode“ muss eines davon sein: off, merge, replace/);
    expect(check({ effect_once: 'ja' })).toThrow(/„shared\.effect_once“ muss true oder false/);
    expect(check({ effect_helper: 'input_boolean.x' })).toThrow(/„shared\.effect_helper“ muss ein Text-Helfer/);
  });

  it('prüft gemeinsame Türchen wie persönliche, inklusive mode', () => {
    expect(check({ doors: { 6: { mode: 'alle' } } })).toThrow(/„shared\.doors\.6\.mode“/);
    expect(check({ doors: { 25: {} } })).toThrow(/„shared\.doors“: „25“ ist kein Türchen/);
    expect(check({ doors: { 6: { txt: 'x' } } })).toThrow(/„shared\.doors\.6\.txt“ gibt es nicht/);
  });

  it('erlaubt mode nur in gemeinsamen Türchen', () => {
    expect(() =>
      validatePersonConfig({
        type: TYPE,
        users: { jens: { doors: { 6: { mode: 'replace' } as never } } },
      }),
    ).toThrow(/„users\.jens\.doors\.6\.mode“ gibt es nicht/);
  });
});
