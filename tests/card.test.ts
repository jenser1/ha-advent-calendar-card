// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/advent-calendar-card';
import type { AdventCalendarCardConfig, HomeAssistant } from '../src/types';
import { mockHass } from './mock-hass';

const TYPE = 'custom:advent-calendar-card';
const KEY = 'advent_calendar_2026';
const TEST_KEY = 'advent_calendar_2026_test';

/** Wartet, bis Laden/Speichern über den (gemockten) WebSocket durch ist. */
async function settle(card: HTMLElement & { updateComplete: Promise<boolean> }) {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await card.updateComplete;
  }
}

async function renderCard(config: Omit<AdventCalendarCardConfig, 'type'>, hass?: HomeAssistant) {
  const card = document.createElement('advent-calendar-card');
  card.setConfig({ type: TYPE, ...config });
  card.hass = hass;
  document.body.append(card);
  await settle(card);
  return card;
}

function doors(card: HTMLElement) {
  return [...card.shadowRoot!.querySelectorAll('advent-calendar-door')];
}

function statuses(card: HTMLElement) {
  return doors(card).map((door) => door.status);
}

function toasts(card: HTMLElement): string[] {
  const messages: string[] = [];
  card.addEventListener('hass-notification', (event) => {
    messages.push((event as CustomEvent<{ message: string }>).detail.message);
  });
  return messages;
}

function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Grundgerüst', () => {
  it('registriert sich als Element und im Karten-Picker', () => {
    expect(customElements.get('advent-calendar-card')).toBeDefined();
    expect(customElements.get('advent-calendar-door')).toBeDefined();
    expect(window.customCards?.some((c) => c.type === 'advent-calendar-card')).toBe(true);
  });

  it('zeigt 24 Türchen von 1 bis 24', async () => {
    const card = await renderCard({});
    const all = doors(card);

    expect(all.map((door) => door.day)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));

    await all[23].updateComplete;
    expect(all[23].shadowRoot!.textContent).toContain('24');
  });

  it('nutzt den Titel aus der Config', async () => {
    const card = await renderCard({ title: 'Jens’ Kalender' });
    expect(card.shadowRoot!.querySelector('.card-header')?.textContent).toBe('Jens’ Kalender');
  });

  it('bildet den Standardtitel aus dem Jahr', async () => {
    const card = await renderCard({ year: 2026 });
    expect(card.shadowRoot!.querySelector('.card-header')?.textContent).toBe('Adventskalender 2026');
  });

  it('blendet den Titel bei leerem String aus', async () => {
    const card = await renderCard({ title: '' });
    expect(card.shadowRoot!.querySelector('.card-header')).toBeNull();
  });
});

describe('Config-Prüfung', () => {
  it('lehnt ungültige Jahreszahlen ab', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, year: 26 })).toThrow(/year/);
    expect(() => card.setConfig({ type: TYPE, year: '2026' as unknown as number })).toThrow(/year/);
  });

  it('lehnt ungültiges debug_date ab', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, debug_date: '05.12.2026' })).toThrow(/debug_date/);
  });

  it('akzeptiert debug_date als Text, Date oder leer', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, debug_date: '2026-12-05' })).not.toThrow();
    expect(() => card.setConfig({ type: TYPE, debug_date: new Date(Date.UTC(2026, 11, 5)) })).not.toThrow();
    expect(() => card.setConfig({ type: TYPE, debug_date: '' })).not.toThrow();
  });
});

describe('Datumslogik in der Karte', () => {
  it('sperrt im Oktober alle Türchen', async () => {
    setNow('2026-10-17T10:00:00Z');
    const card = await renderCard({}, mockHass());
    expect(new Set(statuses(card))).toEqual(new Set(['locked']));
  });

  it('nutzt die Zeitzone aus hass.config.time_zone', async () => {
    setNow('2026-11-30T23:30:00Z');
    const berlin = await renderCard({ year: 2026 }, mockHass({ timeZone: 'Europe/Berlin' }));
    const newYork = await renderCard({ year: 2026 }, mockHass({ timeZone: 'America/New_York' }));

    expect(statuses(berlin)[0]).toBe('openable');
    expect(statuses(newYork)[0]).toBe('locked');
  });

  it('beachtet debug_date für Admins und zeigt den Testmodus an', async () => {
    setNow('2026-10-17T10:00:00Z');
    const card = await renderCard({ debug_date: '2026-12-05' }, mockHass({ isAdmin: true }));

    const result = statuses(card);
    expect(result.slice(0, 4)).toEqual(['missed', 'missed', 'missed', 'missed']);
    expect(result[4]).toBe('openable');
    expect(result[5]).toBe('locked');
    expect(card.shadowRoot!.querySelector('.debug')?.textContent).toContain('05.12.2026');
  });

  it('ignoriert debug_date für Nicht-Admins', async () => {
    setNow('2026-10-17T10:00:00Z');
    const card = await renderCard({ debug_date: '2026-12-05' }, mockHass({ isAdmin: false }));

    expect(new Set(statuses(card))).toEqual(new Set(['locked']));
    expect(card.shadowRoot!.querySelector('.debug')).toBeNull();
  });

  it('wertet debug_date neu aus, wenn hass erst später kommt', async () => {
    setNow('2026-10-17T10:00:00Z');
    const card = await renderCard({ debug_date: '2026-12-05' });
    expect(statuses(card)[4]).toBeUndefined();

    card.hass = mockHass({ isAdmin: true });
    await settle(card);
    expect(statuses(card)[4]).toBe('openable');
  });

  it('zeigt für gesperrte Türchen einen Toast mit den restlichen Tagen', async () => {
    setNow('2026-11-30T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    const messages = toasts(card);

    doors(card)[0].click();
    doors(card)[23].click();

    expect(messages).toEqual(['Noch 1 Tag!', 'Noch 24 Tage!']);
  });

  it('zeigt die Statistik erst nach dem 24. Dezember', async () => {
    setNow('2026-12-24T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    doors(card)[23].click();
    await settle(card);
    expect(card.shadowRoot!.querySelector('.stats')).toBeNull();

    vi.setSystemTime(new Date('2026-12-25T12:00:00Z'));
    card.remove();
    document.body.append(card); // connectedCallback prüft das Datum neu
    await settle(card);
    expect(card.shadowRoot!.querySelector('.stats')?.textContent).toBe('1/24 geöffnet');
  });
});

describe('Speicherung', () => {
  it('zeigt Türchen neutral und nicht klickbar, bis der Stand geladen ist', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass();
    hass.hangLoad = true;
    const card = await renderCard({ year: 2026 }, hass);

    expect(new Set(statuses(card))).toEqual(new Set([undefined]));
    doors(card)[4].click();
    await settle(card);
    expect(hass.calls.some((call) => call.type === 'frontend/set_user_data')).toBe(false);
  });

  it('lädt geöffnete Türchen aus frontend/get_user_data', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass({
      userData: { [KEY]: { version: 1, opened: { 3: '2026-12-03T07:00:00Z' } } },
    });
    const card = await renderCard({ year: 2026 }, hass);

    expect(hass.calls).toEqual([{ type: 'frontend/get_user_data', key: KEY }]);
    expect(statuses(card).slice(0, 5)).toEqual(['missed', 'missed', 'opened', 'missed', 'openable']);
  });

  it('lädt beim Zurückkehren auf die Ansicht neu', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass();
    const card = await renderCard({ year: 2026 }, hass);

    // Inzwischen auf einem anderen Gerät geöffnet
    hass.userData.set(KEY, { version: 1, opened: { 5: '2026-12-05T11:00:00Z' } });
    card.remove();
    document.body.append(card);
    await settle(card);

    expect(statuses(card)[4]).toBe('opened');
  });

  it('speichert das heutige Türchen beim Öffnen', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass();
    const card = await renderCard({ year: 2026 }, hass);

    doors(card)[4].click();
    await settle(card);

    expect(statuses(card)[4]).toBe('opened');
    expect(hass.userData.get(KEY)).toEqual({
      version: 1,
      opened: { 5: '2026-12-05T12:00:00.000Z' },
    });
  });

  it('übersteht ein Neuladen der Karte', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass();
    const first = await renderCard({ year: 2026 }, hass);
    doors(first)[4].click();
    await settle(first);
    first.remove();

    const second = await renderCard({ year: 2026 }, hass);
    expect(statuses(second)[4]).toBe('opened');
  });

  it('nimmt das Öffnen zurück und meldet sich, wenn Speichern scheitert', async () => {
    setNow('2026-12-05T12:00:00Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hass = mockHass();
    hass.failSave = true;
    const card = await renderCard({ year: 2026 }, hass);
    const messages = toasts(card);

    doors(card)[4].click();
    await settle(card);

    expect(statuses(card)[4]).toBe('openable');
    expect(messages).toEqual(['Türchen konnte nicht gespeichert werden. Bitte nochmal versuchen.']);
  });

  it('zeigt einen Hinweis, wenn Laden scheitert', async () => {
    setNow('2026-12-05T12:00:00Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hass = mockHass();
    hass.callWS = async () => {
      throw new Error('Verbindung verloren');
    };
    const card = await renderCard({ year: 2026 }, hass);

    expect(card.shadowRoot!.querySelector('.error')).not.toBeNull();
    expect(new Set(statuses(card))).toEqual(new Set([undefined]));
  });

  it('lädt den Stand des neuen Benutzers, wenn der Benutzer wechselt', async () => {
    setNow('2026-12-05T12:00:00Z');
    const jens = mockHass({ userId: 'jens', userData: { [KEY]: { version: 1, opened: { 3: 'x' } } } });
    const anna = mockHass({ userId: 'anna' });
    const card = await renderCard({ year: 2026 }, jens);
    expect(statuses(card)[2]).toBe('opened');

    card.hass = anna;
    await settle(card);
    expect(statuses(card)[2]).toBe('missed');
  });
});

describe('Testmodus und Speicherung', () => {
  it('speichert im Testmodus unter eigenem Schlüssel', async () => {
    setNow('2026-10-17T10:00:00Z');
    const hass = mockHass({
      isAdmin: true,
      userData: { [KEY]: { version: 1, opened: {} } },
    });
    const card = await renderCard({ debug_date: '2026-12-05' }, hass);

    doors(card)[4].click();
    await settle(card);

    expect(hass.userData.get(TEST_KEY)).toEqual({
      version: 1,
      opened: { 5: '2026-10-17T10:00:00.000Z' },
    });
    expect(hass.userData.get(KEY)).toEqual({ version: 1, opened: {} });
  });

  it('setzt Testdaten per Button zurück', async () => {
    setNow('2026-10-17T10:00:00Z');
    const hass = mockHass({
      isAdmin: true,
      userData: {
        [KEY]: { version: 1, opened: { 1: 'echt' } },
        [TEST_KEY]: { version: 1, opened: { 4: 'test', 5: 'test' } },
      },
    });
    const card = await renderCard({ debug_date: '2026-12-05' }, hass);
    const messages = toasts(card);
    expect(statuses(card)[4]).toBe('opened');

    card.shadowRoot!.querySelector<HTMLButtonElement>('.reset')!.click();
    await settle(card);

    expect(statuses(card)[4]).toBe('openable');
    expect(hass.userData.get(TEST_KEY)).toEqual({ version: 1, opened: {} });
    expect(hass.userData.get(KEY)).toEqual({ version: 1, opened: { 1: 'echt' } });
    expect(messages).toEqual(['Testdaten zurückgesetzt.']);
  });

  it('zeigt Nicht-Admins die echten Daten, auch wenn debug_date gesetzt ist', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = mockHass({
      isAdmin: false,
      userData: {
        [KEY]: { version: 1, opened: { 2: 'echt' } },
        [TEST_KEY]: { version: 1, opened: { 3: 'test' } },
      },
    });
    const card = await renderCard({ year: 2026, debug_date: '2026-12-10' }, hass);

    expect(statuses(card)[1]).toBe('opened');
    expect(statuses(card)[2]).toBe('missed');
    expect(card.shadowRoot!.querySelector('.reset')).toBeNull();
  });
});
