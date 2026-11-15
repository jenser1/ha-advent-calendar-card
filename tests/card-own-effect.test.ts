// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHass } from './mock-hass';
import { KEY, TYPE, doors, renderCard, setNow, settle } from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const OWN = { action: 'script.advent_eigener_effekt' };

function homeWithScripts(options: Parameters<typeof mockHass>[0] = {}) {
  return mockHass({
    services: ['script.turn_on', 'script.advent_eigener_effekt', 'script.advent_lichtshow'],
    entities: ['script.advent_eigener_effekt', 'script.advent_lichtshow'],
    ...options,
  });
}

async function clickDoor(card: HTMLElementTagNameMap['advent-calendar-card'], day: number) {
  doors(card)[day - 1].click();
  await settle(card);
  await settle(card);
}

describe('Eigener Effekt (Option effect)', () => {
  it('läuft beim ersten Öffnen jedes Türchens, auch ohne Inhalt, mit tag und person', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts();
    const card = await renderCard({ year: 2026, effect: OWN, users: { jens: {} } }, hass);

    await clickDoor(card, 5);

    expect(hass.serviceCalls).toEqual([
      {
        domain: 'script',
        service: 'advent_eigener_effekt',
        data: { tag: 5, person: 'jens' },
        target: undefined,
        notifyOnError: false,
      },
    ]);
  });

  it('läuft zusätzlich zum Effekt des Türchens', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts();
    const card = await renderCard(
      {
        year: 2026,
        effect: OWN,
        users: { jens: { doors: { 5: { effect: { action: 'script.advent_lichtshow' } } } } },
      },
      hass,
    );

    await clickDoor(card, 5);

    expect(hass.serviceCalls.map((call) => `${call.domain}.${call.service}`).sort()).toEqual([
      'script.advent_eigener_effekt',
      'script.advent_lichtshow',
    ]);
  });

  it('löst beim erneuten Ansehen nichts aus', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts({
      userData: { [KEY]: { version: 1, opened: { 5: '2026-12-05T07:00:00Z' } } },
    });
    const card = await renderCard({ year: 2026, effect: OWN, users: { jens: {} } }, hass);

    await clickDoor(card, 5);

    expect(hass.serviceCalls).toEqual([]);
  });

  it('läuft auch im Testmodus für Admins', async () => {
    setNow('2026-11-15T12:00:00Z');
    const hass = homeWithScripts({ isAdmin: true });
    const card = await renderCard(
      { year: 2026, effect: OWN, debug_date: '2026-12-02', users: { jens: {} } },
      hass,
    );

    await clickDoor(card, 2);

    expect(hass.serviceCalls.map((call) => call.data)).toEqual([{ tag: 2, person: 'jens' }]);
  });

  it('meldet ungültige Effekte verständlich', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, effect: { action: 'kaputt' } as never })).toThrow(
      '„effect.action“ muss die Form „domain.dienst“ haben',
    );
    expect(() => card.setConfig({ type: TYPE, effect: { action: 'script.x', delay: 5 } as never })).toThrow(
      '„effect.delay“ gibt es nicht.',
    );
  });
});
