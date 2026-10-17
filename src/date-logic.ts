/** Kalenderdatum ohne Uhrzeit; month ist 1-basiert (12 = Dezember). */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type DoorStatus = 'locked' | 'openable' | 'opened' | 'missed';

export interface EffectiveToday {
  date: CalendarDate;
  /** true, wenn das Datum aus debug_date stammt. */
  debug: boolean;
}

export const DOOR_COUNT = 24;

const MS_PER_DAY = 86_400_000;

function dayNumber({ year, month, day }: CalendarDate): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** Anzahl Tage von `from` bis `to` (negativ, wenn `to` davor liegt). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function isSameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isValidDate({ year, month, day }: CalendarDate): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatGermanDate({ year, month, day }: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(day)}.${pad(month)}.${year}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Das Datum, das in `timeZone` gerade gilt. Unbekannte Zonen fallen auf die Browser-Zeitzone zurück. */
export function todayInTimeZone(now: Date, timeZone?: string): CalendarDate {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = formatterFor(timeZone || undefined);
  } catch {
    formatter = formatterFor(undefined);
  }
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

/**
 * Liest debug_date aus der Config. Akzeptiert "JJJJ-MM-TT", ISO-Zeitstempel und
 * Date-Objekte: Der YAML-Editor von HA macht aus `2026-12-05` ein Date (UTC-Mitternacht),
 * das nach dem Speichern als ISO-Zeitstempel zurückkommt.
 */
export function parseDebugDate(value: unknown): CalendarDate | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidDate(date) ? date : undefined;
}

/** „Heute“ für die Karte: debug_date gilt nur für Admins, sonst das Datum in der HA-Zeitzone. */
export function effectiveToday(options: {
  now: Date;
  timeZone?: string;
  debugDate?: unknown;
  isAdmin: boolean;
}): EffectiveToday {
  const debugDate = options.isAdmin ? parseDebugDate(options.debugDate) : undefined;
  if (debugDate) {
    return { date: debugDate, debug: true };
  }
  return { date: todayInTimeZone(options.now, options.timeZone), debug: false };
}

function doorDate(year: number, day: number): CalendarDate {
  return { year, month: 12, day };
}

export function getDoorStatus(
  day: number,
  year: number,
  today: CalendarDate,
  opened: boolean,
): DoorStatus {
  if (opened) {
    return 'opened';
  }
  const diff = daysBetween(today, doorDate(year, day));
  if (diff > 0) {
    return 'locked';
  }
  return diff === 0 ? 'openable' : 'missed';
}

/** Tage bis Türchen `day` öffenbar ist (0 = heute, negativ = vorbei). */
export function daysUntilDoor(day: number, year: number, today: CalendarDate): number {
  return daysBetween(today, doorDate(year, day));
}

/** true ab dem 25. Dezember des Kalenderjahres. */
export function isSeasonOver(year: number, today: CalendarDate): boolean {
  return daysBetween(doorDate(year, DOOR_COUNT), today) > 0;
}
