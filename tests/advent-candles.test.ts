// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { burnedWeeks, candleHeight } from '../src/advent-candles';
import { adventSunday } from '../src/advent-sundays';
import type { AdventCalendarCardConfig, DoorContent } from '../src/types';
import { mockHass } from './mock-hass';
import { TYPE, doors, renderCard, setNow, settle } from './render-card';
import { change, forms, last, renderEditor } from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('Adventssonntage', () => {
  it('kennt die Adventssonntage 2026 (6., 13., 20.12.)', () => {
    const advents = Array.from({ length: 24 }, (_, i) => [i + 1, adventSunday(2026, i + 1)])
      .filter(([, advent]) => advent !== undefined);
    expect(advents).toEqual([
      [6, 2],
      [13, 3],
      [20, 4],
    ]);
  });

  it('rechnet auch andere Jahre richtig', () => {
    // 2024: 1. Advent am 1.12.
    expect([1, 8, 15, 22].map((day) => adventSunday(2024, day))).toEqual([1, 2, 3, 4]);
    // 2023: Heiligabend ist selbst der 4. Advent.
    expect([3, 10, 17, 24].map((day) => adventSunday(2023, day))).toEqual([1, 2, 3, 4]);
    expect(adventSunday(2026, 0)).toBeUndefined();
    expect(adventSunday(2026, 25)).toBeUndefined();
  });

  it('lässt angezündete Kerzen pro Woche herunterbrennen, unangezündete bleiben neu', () => {
    expect([0, 1, 2, 3].map((i) => burnedWeeks(2, i))).toEqual([2, 1, 0, 0]);
    const second = [0, 1, 2, 3].map((i) => candleHeight(2, i));
    expect(second[0]).toBeLessThan(second[1]);
    expect(second[1]).toBeLessThan(second[2]);
    expect(second[2]).toBe(second[3]);
  });
});

async function openDoor(day: number, content: DoorContent, extra: Partial<AdventCalendarCardConfig> = {}) {
  setNow(`2026-12-${String(day).padStart(2, '0')}T12:00:00Z`);
  const card = await renderCard({ year: 2026, users: { jens: { doors: { [day]: content } } }, ...extra }, mockHass());
  doors(card)[day - 1].click();
  await settle(card);
  const dialog = card.shadowRoot!.querySelector('advent-calendar-dialog')!;
  await settle(dialog);
  return dialog.shadowRoot!.querySelector('.inner')!;
}

describe('Kerzen im Dialog', () => {
  it('zeigt am 2. Advent vier Kerzen neben dem Video, zwei davon brennen', async () => {
    const inner = await openDoor(6, { text: 'Hallo', video: VIDEO });

    const row = inner.querySelector('.video-row')!;
    expect(row.querySelector('iframe')).not.toBeNull();
    const candles = row.querySelector('.candles')!;
    expect(candles.querySelectorAll('.candle')).toHaveLength(4);
    expect([...candles.querySelectorAll('.candle')].map((c) => c.classList.contains('lit'))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(candles.querySelectorAll('.flame')).toHaveLength(2);
    expect(candles.getAttribute('aria-label')).toBe('2. Advent');
    expect(candles.querySelector('.label')!.textContent).toBe('2. Advent');
  });

  it('am 4. Advent brennen alle vier, die erste ist am weitesten heruntergebrannt', async () => {
    const inner = await openDoor(20, { video: VIDEO });
    expect(inner.querySelectorAll('.candles .flame')).toHaveLength(4);
    const heights = [...inner.querySelectorAll('.candles .candle')].map((c) => Number(c.getAttribute('data-height')));
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights[0]).toBeLessThan(heights[3] / 2);
  });

  it('zeigt ohne Video die Kerzen als Zeile unter der Überschrift', async () => {
    const inner = await openDoor(13, { text: 'Kein Video heute' });
    expect(inner.querySelector('.video-row')).toBeNull();
    expect(inner.querySelectorAll('.candles.row .flame')).toHaveLength(3);
  });

  it('zeigt an normalen Tagen keine Kerzen', async () => {
    const inner = await openDoor(5, { video: VIDEO });
    expect(inner.querySelector('.candles')).toBeNull();
    expect(inner.querySelector('.video-row')).toBeNull();
  });

  it('lässt sich abschalten', async () => {
    const inner = await openDoor(6, { video: VIDEO }, { advent_candles: false });
    expect(inner.querySelector('.candles')).toBeNull();
  });

  it('prüft die Option', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, advent_candles: 'ja' } as never)).toThrow(
      '„advent_candles“ muss true oder false sein.',
    );
  });
});

describe('Editor: Kerzen', () => {
  it('ist standardmäßig an und schreibt nur „aus“ in die Config', async () => {
    const { editor, changes } = await renderEditor({});
    expect(forms(editor)[0].data.advent_candles).toBe(true);

    await change(editor, forms(editor)[0], { advent_candles: false });
    expect(last(changes)).toEqual({ type: TYPE, advent_candles: false });

    await change(editor, forms(editor)[0], { advent_candles: true });
    expect(last(changes)).toEqual({ type: TYPE });
  });
});
