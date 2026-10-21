// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHass } from './mock-hass';
import {
  displayedDoors,
  doors,
  renderCard,
  setMediaPreferences,
  setNow,
  settle,
} from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  setMediaPreferences();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function haCard(card: HTMLElement) {
  return card.shadowRoot!.querySelector('ha-card')!;
}

const order = (card: HTMLElement) => displayedDoors(card).map((door) => door.day);
const ONE_TO_24 = Array.from({ length: 24 }, (_, i) => i + 1);

describe('Reihenfolge der Türchen', () => {
  it('mischt standardmäßig pro Benutzer und bleibt dabei', async () => {
    const jens = await renderCard({ year: 2026 }, mockHass({ userId: 'id-jens' }));
    const jensAgain = await renderCard({ year: 2026 }, mockHass({ userId: 'id-jens' }));
    const anna = await renderCard({ year: 2026 }, mockHass({ userId: 'id-anna' }));

    expect(order(jens)).not.toEqual(ONE_TO_24);
    expect([...order(jens)].sort((a, b) => a - b)).toEqual(ONE_TO_24);
    expect(order(jensAgain)).toEqual(order(jens));
    expect(order(anna)).not.toEqual(order(jens));
  });

  it('zeigt mit shuffle: false die Reihenfolge 1–24', async () => {
    const card = await renderCard({ year: 2026, shuffle: false }, mockHass());
    expect(order(card)).toEqual(ONE_TO_24);
  });

  it('lehnt nicht-boolesche Werte für shuffle und snow ab', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: 'custom:advent-calendar-card', shuffle: 'ja' as never })).toThrow(
      /„shuffle“ muss true oder false sein/,
    );
    expect(() => card.setConfig({ type: 'custom:advent-calendar-card', snow: 1 as never })).toThrow(
      /„snow“ muss true oder false sein/,
    );
  });
});

describe('Themes hell und dunkel', () => {
  it('folgt dem dunklen Design von HA', async () => {
    const light = mockHass();
    light.themes = { darkMode: false };
    const dark = mockHass();
    dark.themes = { darkMode: true };

    expect([...haCard(await renderCard({ theme: 'winter' }, light)).classList]).toEqual(['theme-winter', 'light']);
    expect([...haCard(await renderCard({ theme: 'winter' }, dark)).classList]).toEqual(['theme-winter', 'dark']);
  });

  it('wechselt beim Umschalten von HA ohne neue Config', async () => {
    const hass = mockHass();
    hass.themes = { darkMode: false };
    const card = await renderCard({ theme: 'kids' }, hass);

    card.hass = { ...hass, themes: { darkMode: true } };
    await settle(card);

    expect(haCard(card).classList.contains('dark')).toBe(true);
  });

  it('nutzt ohne Angabe von HA die Einstellung des Geräts', async () => {
    setMediaPreferences({ dark: true });
    const card = await renderCard({ theme: 'kids' }, mockHass());
    expect(haCard(card).classList.contains('dark')).toBe(true);
  });

  it('zeigt nerd immer dunkel', async () => {
    const hass = mockHass();
    hass.themes = { darkMode: false };
    const card = await renderCard({ theme: 'nerd' }, hass);
    expect(haCard(card).classList.contains('dark')).toBe(true);
  });

  it('färbt bei kids jedes Türchen eigen', async () => {
    const kids = await renderCard({ theme: 'kids', shuffle: false }, mockHass());
    const winter = await renderCard({ theme: 'winter', shuffle: false }, mockHass());

    const colors = doors(kids).slice(0, 7).map((door) => door.style.getPropertyValue('--advent-door-bg'));
    expect(new Set(colors).size).toBe(7);
    expect(doors(winter)[0].getAttribute('style')).toBe('');
  });
});

describe('Schnee', () => {
  it('fällt nur mit snow: true', async () => {
    const without = await renderCard({}, mockHass());
    const withSnow = await renderCard({ snow: true }, mockHass());

    expect(without.shadowRoot!.querySelector('advent-calendar-snow')).toBeNull();
    expect(withSnow.shadowRoot!.querySelector('advent-calendar-snow')).not.toBeNull();
  });
});

describe('Animationen', () => {
  it('lässt gesperrte Türchen beim Antippen wackeln', async () => {
    setMediaPreferences({ reducedMotion: false });
    setNow('2026-11-30T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    const door = doors(card)[9];

    door.click();
    await settle(door);

    expect(door.shadowRoot!.querySelector('.door')!.classList.contains('wobble')).toBe(true);
  });

  it('wackelt nicht bei „Bewegung reduzieren“', async () => {
    setNow('2026-11-30T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    const door = doors(card)[9];

    door.click();
    await settle(door);

    expect(door.shadowRoot!.querySelector('.door')!.classList.contains('wobble')).toBe(false);
  });

  it('klappt das heutige Türchen auf und zeigt den Inhalt erst danach', async () => {
    setMediaPreferences({ reducedMotion: false });
    setNow('2026-12-05T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    const door = doors(card)[4];
    const dialog = card.shadowRoot!.querySelector('advent-calendar-dialog')!;

    door.click();
    await settle(card);
    await settle(door);
    expect(door.shadowRoot!.querySelector('.door')!.classList.contains('opening')).toBe(true);
    expect(door.status).toBe('opened');
    expect(dialog.open).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 750));
    await settle(card);
    expect(dialog.open).toBe(true);
  });

  it('zeigt geöffnete Türchen aufgeklappt mit Innenseite', async () => {
    setNow('2026-12-05T12:00:00Z');
    const card = await renderCard(
      { year: 2026 },
      mockHass({ userData: { advent_calendar_2026: { version: 1, opened: { 3: 'x' } } } }),
    );
    await settle(doors(card)[2]);

    expect(doors(card)[2].shadowRoot!.querySelector('.inside')?.textContent).toContain('✔');
    expect(doors(card)[3].shadowRoot!.querySelector('.inside')).toBeNull();
  });
});
