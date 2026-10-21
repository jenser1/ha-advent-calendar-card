import { describe, expect, it } from 'vitest';
import { colorMode, doorColor, resolveTheme, shuffledDays } from '../src/themes';

const ONE_TO_24 = Array.from({ length: 24 }, (_, i) => i + 1);

describe('shuffledDays', () => {
  it('liefert jedes Türchen genau einmal', () => {
    const days = shuffledDays('id-jens-2026');
    expect([...days].sort((a, b) => a - b)).toEqual(ONE_TO_24);
    expect(days).not.toEqual(ONE_TO_24);
  });

  it('ist für denselben Startwert immer gleich', () => {
    expect(shuffledDays('id-jens-2026')).toEqual(shuffledDays('id-jens-2026'));
  });

  it('unterscheidet sich zwischen Personen und Jahren', () => {
    const jens = shuffledDays('id-jens-2026');
    expect(shuffledDays('id-anna-2026')).not.toEqual(jens);
    expect(shuffledDays('id-jens-2027')).not.toEqual(jens);
  });
});

describe('Farbwelten', () => {
  it('folgt hell/dunkel von HA, nur nerd ist immer dunkel', () => {
    expect(colorMode('winter', false)).toBe('light');
    expect(colorMode('winter', true)).toBe('dark');
    expect(colorMode('kids', false)).toBe('light');
    expect(colorMode('nerd', false)).toBe('dark');
  });

  it('gibt bei kids jedem Türchen eine eigene Farbe', () => {
    const colors = ONE_TO_24.slice(0, 7).map((day) => doorColor('kids', 'light', day));
    expect(new Set(colors).size).toBe(7);
    expect(doorColor('kids', 'light', 8)).toBe(doorColor('kids', 'light', 1));
    expect(doorColor('kids', 'dark', 1)).not.toBe(doorColor('kids', 'light', 1));
    expect(doorColor('winter', 'light', 1)).toBeUndefined();
    expect(doorColor('nerd', 'dark', 1)).toBeUndefined();
  });

  it('resolveTheme nimmt das erste gesetzte Theme', () => {
    expect(resolveTheme(undefined, 'kids')).toBe('kids');
    expect(resolveTheme()).toBe('winter');
  });
});
