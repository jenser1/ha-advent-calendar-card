// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/advent-calendar-card';
import type { AdventCalendarCardConfig, HomeAssistant } from '../src/types';

const TYPE = 'custom:advent-calendar-card';

function mockHass(options: { timeZone?: string; isAdmin?: boolean } = {}): HomeAssistant {
  return {
    user: { id: 'user-1', name: 'Jens', is_admin: options.isAdmin ?? false },
    config: { time_zone: options.timeZone ?? 'Europe/Berlin' },
    language: 'de',
    callService: async () => undefined,
    callWS: async <T>() => undefined as T,
  };
}

async function renderCard(config: Omit<AdventCalendarCardConfig, 'type'>, hass?: HomeAssistant) {
  const card = document.createElement('advent-calendar-card');
  card.setConfig({ type: TYPE, ...config });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

function doors(card: HTMLElement) {
  return [...card.shadowRoot!.querySelectorAll('advent-calendar-door')];
}

function statuses(card: HTMLElement) {
  return doors(card).map((door) => door.status);
}

function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
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
    expect(statuses(card)[4]).toBe('locked');

    card.hass = mockHass({ isAdmin: true });
    await card.updateComplete;
    expect(statuses(card)[4]).toBe('openable');
  });

  it('zeigt für gesperrte Türchen einen Toast mit den restlichen Tagen', async () => {
    setNow('2026-11-30T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    const messages: string[] = [];
    card.addEventListener('hass-notification', (event) => {
      messages.push((event as CustomEvent<{ message: string }>).detail.message);
    });

    doors(card)[0].click();
    doors(card)[23].click();

    expect(messages).toEqual(['Noch 1 Tag!', 'Noch 24 Tage!']);
  });

  it('öffnet das heutige Türchen beim Klick', async () => {
    setNow('2026-12-05T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());

    doors(card)[4].click();
    await card.updateComplete;
    expect(statuses(card)[4]).toBe('opened');

    doors(card)[3].click();
    await card.updateComplete;
    expect(statuses(card)[3]).toBe('missed');
  });

  it('zeigt die Statistik erst nach dem 24. Dezember', async () => {
    setNow('2026-12-24T12:00:00Z');
    const card = await renderCard({ year: 2026 }, mockHass());
    doors(card)[23].click();
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.stats')).toBeNull();

    vi.setSystemTime(new Date('2026-12-25T12:00:00Z'));
    card.remove();
    document.body.append(card); // connectedCallback prüft das Datum neu
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.stats')?.textContent).toBe('1/24 geöffnet');
  });
});
