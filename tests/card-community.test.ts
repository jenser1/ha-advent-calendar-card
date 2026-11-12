// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHass } from './mock-hass';
import { KEY, TEST_KEY, TYPE, doors, renderCard, setNow, settle, statuses } from './render-card';

// Community-Edition: Die Karte hat diese Türchen fest eingebaut (beim Bauen aus content/).
vi.mock('../src/edition', () => ({
  COMMUNITY_CALENDAR: {
    year: 2026,
    doors: {
      1: { text: 'Für alle: Türchen 1' },
      6: { text: 'Nikolaus für alle', effect: { action: 'script.turn_on', target: { entity_id: 'script.fremd' } } },
    },
  },
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function dialogOf(card: HTMLElement) {
  return card.shadowRoot!.querySelector('advent-calendar-dialog')!;
}

async function openDoor(card: HTMLElementTagNameMap['advent-calendar-card'], day: number) {
  doors(card)[day - 1].click();
  await settle(card);
  await settle(card);
}

describe('Community-Edition', () => {
  it('zeigt allen Benutzern dieselben Türchen, ohne Personen anzulegen', async () => {
    setNow('2026-12-06T12:00:00Z');
    for (const user of [{ userId: 'id-jens', userName: 'Jens' }, { userId: 'id-gast', userName: 'Gast' }]) {
      const card = await renderCard({}, mockHass(user));
      await openDoor(card, 6);
      expect(dialogOf(card).content).toEqual({ text: 'Nikolaus für alle' });
      expect(dialogOf(card).sharedContent).toBeNull();
      card.remove();
    }
  });

  it('löst Effekte aus den eingebauten Inhalten nie aus', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = mockHass({ services: ['script.turn_on'], entities: ['script.fremd'] });
    const card = await renderCard({}, hass);

    await openDoor(card, 6);

    expect(statuses(card)[5]).toBe('opened');
    expect(hass.serviceCalls).toEqual([]);
  });

  it('speichert den Stand weiter pro Benutzer und Jahr', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = mockHass();
    const card = await renderCard({}, hass);
    await openDoor(card, 6);

    expect(hass.calls.map((call) => `${call.type} ${call.key}`)).toContain(`frontend/set_user_data ${KEY}`);
  });

  it('bleibt im Januar beim Kalender des eingebauten Jahres', async () => {
    setNow('2027-01-05T12:00:00Z');
    const card = await renderCard({}, mockHass());

    expect(card.shadowRoot!.querySelector('.card-header')?.textContent).toBe('Adventskalender 2026');
    expect(new Set(statuses(card))).toEqual(new Set(['missed']));
    expect(card.shadowRoot!.querySelector('.stats')?.textContent).toBe('0/24 geöffnet');
  });

  it('lässt Admins mit Testdatum testen', async () => {
    setNow('2026-11-12T12:00:00Z');
    const hass = mockHass({ isAdmin: true });
    const card = await renderCard({ debug_date: '2026-12-01' }, hass);

    expect(statuses(card)[0]).toBe('openable');
    await openDoor(card, 1);
    expect(dialogOf(card).content).toEqual({ text: 'Für alle: Türchen 1' });
    expect(hass.userData.has(TEST_KEY)).toBe(true);
  });

  it('zeigt eine Fehlermeldung für Optionen, die es erst nächstes Jahr gibt', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, users: { jens: {} } })).toThrow(
      '„users“ gibt es in der Community-Edition 2026 noch nicht – eigene Kalender kommen 2027.',
    );
    expect(() => card.setConfig({ type: TYPE, year: 2027 })).toThrow('immer den Kalender 2026');
    expect(() => card.setConfig({ type: TYPE, title: 'Advent', theme: 'nerd', snow: true })).not.toThrow();
  });
});
