import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  daysUntilDoor,
  effectiveToday,
  formatGermanDate,
  getDoorStatus,
  isSeasonOver,
  isValidDate,
  parseDebugDate,
  todayInTimeZone,
  type CalendarDate,
} from '../src/date-logic';

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('todayInTimeZone', () => {
  const lateEvening = new Date('2026-11-30T23:30:00Z');

  it('liefert das Datum in der angegebenen Zeitzone', () => {
    expect(todayInTimeZone(lateEvening, 'UTC')).toEqual(date(2026, 11, 30));
    expect(todayInTimeZone(lateEvening, 'Europe/Berlin')).toEqual(date(2026, 12, 1));
    expect(todayInTimeZone(lateEvening, 'America/New_York')).toEqual(date(2026, 11, 30));
    expect(todayInTimeZone(new Date('2026-12-01T10:30:00Z'), 'Pacific/Kiritimati')).toEqual(
      date(2026, 12, 2),
    );
  });

  it('rechnet über die Sommerzeit-Umstellung richtig', () => {
    // 25.10.2026: Ende der Sommerzeit in Deutschland
    expect(todayInTimeZone(new Date('2026-10-24T22:30:00Z'), 'Europe/Berlin')).toEqual(
      date(2026, 10, 25),
    );
    expect(todayInTimeZone(new Date('2026-10-25T22:30:00Z'), 'Europe/Berlin')).toEqual(
      date(2026, 10, 25),
    );
  });

  it('wechselt an Silvester ins neue Jahr', () => {
    expect(todayInTimeZone(new Date('2026-12-31T23:30:00Z'), 'Europe/Berlin')).toEqual(
      date(2027, 1, 1),
    );
  });

  it('fällt bei unbekannter oder fehlender Zeitzone auf die Browser-Zeitzone zurück', () => {
    const now = new Date('2026-12-05T12:00:00Z');
    const local = date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    expect(todayInTimeZone(now, 'Mars/Olympus_Mons')).toEqual(local);
    expect(todayInTimeZone(now, '')).toEqual(local);
    expect(todayInTimeZone(now)).toEqual(local);
  });
});

describe('parseDebugDate', () => {
  it('akzeptiert JJJJ-MM-TT', () => {
    expect(parseDebugDate('2026-12-05')).toEqual(date(2026, 12, 5));
    expect(parseDebugDate(' 2026-12-05 ')).toEqual(date(2026, 12, 5));
  });

  it('akzeptiert Date-Objekte aus dem YAML-Editor und gespeicherte ISO-Zeitstempel', () => {
    expect(parseDebugDate(new Date(Date.UTC(2026, 11, 5)))).toEqual(date(2026, 12, 5));
    expect(parseDebugDate('2026-12-05T00:00:00.000Z')).toEqual(date(2026, 12, 5));
  });

  it('lehnt ungültige Werte ab', () => {
    for (const value of [
      '2026-13-01',
      '2026-02-29',
      '2026-12-32',
      '05.12.2026',
      '2026-12-5',
      'morgen',
      '',
      20261205,
      null,
      undefined,
      new Date('kaputt'),
    ]) {
      expect(parseDebugDate(value), String(value)).toBeUndefined();
    }
  });

  it('kennt Schaltjahre', () => {
    expect(parseDebugDate('2028-02-29')).toEqual(date(2028, 2, 29));
  });
});

describe('effectiveToday', () => {
  const now = new Date('2026-10-17T10:00:00Z');

  it('nutzt debug_date nur für Admins', () => {
    expect(
      effectiveToday({ now, timeZone: 'Europe/Berlin', debugDate: '2026-12-05', isAdmin: true }),
    ).toEqual({ date: date(2026, 12, 5), debug: true });
    expect(
      effectiveToday({ now, timeZone: 'Europe/Berlin', debugDate: '2026-12-05', isAdmin: false }),
    ).toEqual({ date: date(2026, 10, 17), debug: false });
  });

  it('nutzt ohne oder mit ungültigem debug_date das echte Datum', () => {
    expect(effectiveToday({ now, timeZone: 'Europe/Berlin', isAdmin: true })).toEqual({
      date: date(2026, 10, 17),
      debug: false,
    });
    expect(
      effectiveToday({ now, timeZone: 'Europe/Berlin', debugDate: 'quatsch', isAdmin: true }),
    ).toEqual({ date: date(2026, 10, 17), debug: false });
  });
});

describe('getDoorStatus', () => {
  const statuses = (today: CalendarDate, opened: number[] = [], year = 2026) =>
    Array.from({ length: 24 }, (_, i) => getDoorStatus(i + 1, year, today, opened.includes(i + 1)));

  it('sperrt vor Dezember alle Türchen', () => {
    expect(new Set(statuses(date(2026, 11, 30)))).toEqual(new Set(['locked']));
  });

  it('macht genau das heutige Türchen öffenbar', () => {
    const result = statuses(date(2026, 12, 5));
    expect(result.slice(0, 4)).toEqual(['missed', 'missed', 'missed', 'missed']);
    expect(result[4]).toBe('openable');
    expect(new Set(result.slice(5))).toEqual(new Set(['locked']));
  });

  it('zeigt geöffnete Türchen immer als offen, auch nach dem Tag', () => {
    const result = statuses(date(2026, 12, 5), [3, 5]);
    expect(result[2]).toBe('opened');
    expect(result[4]).toBe('opened');
    expect(result[3]).toBe('missed');
  });

  it('lässt nach dem 24. nichts mehr öffnen', () => {
    const result = statuses(date(2026, 12, 25), [1, 24]);
    expect(result.filter((s) => s === 'opened')).toHaveLength(2);
    expect(result.filter((s) => s === 'missed')).toHaveLength(22);
  });

  it('bezieht sich auf das konfigurierte Jahr', () => {
    expect(getDoorStatus(5, 2027, date(2026, 12, 5), false)).toBe('locked');
    expect(getDoorStatus(5, 2025, date(2026, 12, 5), false)).toBe('missed');
  });
});

describe('Tage zählen', () => {
  it('daysBetween ist unabhängig von der Sommerzeit', () => {
    expect(daysBetween(date(2026, 10, 17), date(2026, 12, 1))).toBe(45);
    expect(daysBetween(date(2027, 3, 27), date(2027, 3, 29))).toBe(2);
    expect(daysBetween(date(2026, 12, 5), date(2026, 12, 1))).toBe(-4);
  });

  it('daysUntilDoor zählt bis zum Türchen-Tag', () => {
    expect(daysUntilDoor(1, 2026, date(2026, 11, 30))).toBe(1);
    expect(daysUntilDoor(24, 2026, date(2026, 12, 1))).toBe(23);
    expect(daysUntilDoor(5, 2026, date(2026, 12, 5))).toBe(0);
  });

  it('isSeasonOver gilt ab dem 25. Dezember', () => {
    expect(isSeasonOver(2026, date(2026, 12, 24))).toBe(false);
    expect(isSeasonOver(2026, date(2026, 12, 25))).toBe(true);
    expect(isSeasonOver(2026, date(2027, 1, 10))).toBe(true);
    expect(isSeasonOver(2027, date(2026, 12, 25))).toBe(false);
  });
});

describe('Hilfsfunktionen', () => {
  it('isValidDate', () => {
    expect(isValidDate(date(2026, 12, 31))).toBe(true);
    expect(isValidDate(date(2026, 11, 31))).toBe(false);
    expect(isValidDate(date(2026, 0, 1))).toBe(false);
    expect(isValidDate(date(2026, 1.5, 1))).toBe(false);
  });

  it('formatGermanDate', () => {
    expect(formatGermanDate(date(2026, 12, 5))).toBe('05.12.2026');
  });
});
