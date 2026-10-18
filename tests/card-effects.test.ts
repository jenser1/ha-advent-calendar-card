// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DoorContent } from '../src/types';
import { mockHass } from './mock-hass';
import { KEY, TEST_KEY, doors, renderCard, setNow, settle, toasts } from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const LIGHTSHOW = { action: 'script.advent_lichtshow' };

function homeWithScripts(options: Parameters<typeof mockHass>[0] = {}) {
  return mockHass({
    services: ['script.turn_on', 'script.advent_lichtshow', 'light.turn_on'],
    entities: ['script.advent_lichtshow', 'light.flur'],
    ...options,
  });
}

async function clickDoor(card: HTMLElementTagNameMap['advent-calendar-card'], day: number) {
  doors(card)[day - 1].click();
  await settle(card);
  await settle(card);
}

function jensWith(doorsConfig: Record<number, DoorContent>) {
  return { year: 2026, users: { jens: { doors: doorsConfig } } };
}

describe('Effekte beim Öffnen', () => {
  it('löst den Effekt beim ersten Öffnen aus und gibt Scripts tag und person mit', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts();
    const card = await renderCard(jensWith({ 5: { text: 'Schau ins Wohnzimmer ✨', effect: LIGHTSHOW } }), hass);

    await clickDoor(card, 5);

    expect(hass.serviceCalls).toEqual([
      {
        domain: 'script',
        service: 'advent_lichtshow',
        data: { tag: 5, person: 'jens' },
        target: undefined,
        notifyOnError: false,
      },
    ]);
  });

  it('löst beim erneuten Ansehen nichts aus', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts({
      userData: { [KEY]: { version: 1, opened: { 5: '2026-12-05T07:00:00Z' } } },
    });
    const card = await renderCard(jensWith({ 5: { effect: LIGHTSHOW } }), hass);

    await clickDoor(card, 5);

    expect(card.shadowRoot!.querySelector('advent-calendar-dialog')!.open).toBe(true);
    expect(hass.serviceCalls).toEqual([]);
  });

  it('löst nichts aus, wenn ein anderes Gerät das Türchen inzwischen geöffnet hat', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts();
    const card = await renderCard(jensWith({ 5: { effect: LIGHTSHOW } }), hass);
    // Die Karte zeigt noch „öffenbar“, auf dem Server ist das Türchen aber schon offen.
    hass.userData.set(KEY, { version: 1, opened: { 5: '2026-12-05T11:00:00Z' }, done: {} });

    await clickDoor(card, 5);

    expect(hass.serviceCalls).toEqual([]);
  });

  it('löst mehrere Effekte zusammen aus', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts();
    const card = await renderCard(
      jensWith({
        5: {
          effect: [
            { service: 'script.turn_on', target: { entity_id: 'script.advent_lichtshow' } },
            { action: 'light.turn_on', target: { entity_id: 'light.flur' }, data: { flash: 'long' } },
          ],
        },
      }),
      hass,
    );

    await clickDoor(card, 5);

    expect(hass.serviceCalls.map(({ domain, service, data }) => ({ domain, service, data }))).toEqual([
      { domain: 'script', service: 'turn_on', data: { variables: { tag: 5, person: 'jens' } } },
      { domain: 'light', service: 'turn_on', data: { flash: 'long' } },
    ]);
  });

  it('meldet ein fehlendes Script per Toast, das Türchen bleibt trotzdem offen', async () => {
    setNow('2026-12-05T12:00:00Z');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hass = homeWithScripts();
    const card = await renderCard(jensWith({ 5: { effect: { action: 'script.advent_musik' } } }), hass);
    const messages = toasts(card);

    await clickDoor(card, 5);

    expect(messages).toEqual(['Effekt nicht möglich: „script.advent_musik“ gibt es nicht.']);
    expect(hass.serviceCalls).toEqual([]);
    expect(doors(card)[4].status).toBe('opened');
  });

  it('meldet Fehler von Home Assistant per Toast', async () => {
    setNow('2026-12-05T12:00:00Z');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hass = homeWithScripts();
    hass.failService = 'light.turn_on';
    const card = await renderCard(jensWith({ 5: { effect: { action: 'light.turn_on' } } }), hass);
    const messages = toasts(card);

    await clickDoor(card, 5);

    expect(messages).toEqual(['Effekt nicht möglich: light.turn_on: Unable to find referenced entities']);
  });

  it('löst nichts aus, wenn das Speichern scheitert', async () => {
    setNow('2026-12-05T12:00:00Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hass = homeWithScripts();
    hass.failSave = true;
    const card = await renderCard(jensWith({ 5: { effect: LIGHTSHOW } }), hass);

    await clickDoor(card, 5);

    expect(hass.serviceCalls).toEqual([]);
  });

  it('löst auch im Testmodus aus, nach dem Zurücksetzen erneut', async () => {
    setNow('2026-10-18T10:00:00Z');
    const hass = homeWithScripts({ isAdmin: true });
    const card = await renderCard(
      { debug_date: '2026-12-05', users: { jens: { doors: { 5: { effect: LIGHTSHOW } } } } },
      hass,
    );

    await clickDoor(card, 5);
    expect(hass.serviceCalls).toHaveLength(1);
    expect(hass.userData.get(TEST_KEY)).toMatchObject({ opened: { 5: expect.any(String) } });

    card.shadowRoot!.querySelector<HTMLButtonElement>('.reset')!.click();
    await settle(card);
    card.shadowRoot!.querySelector('advent-calendar-dialog')!.dispatchEvent(new CustomEvent('dialog-closed'));
    await settle(card);
    await clickDoor(card, 5);

    expect(hass.serviceCalls).toHaveLength(2);
  });

  it('nutzt im Fallback-Kalender den HA-Benutzernamen als person', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = homeWithScripts({ userId: 'gast', userName: 'Gäste-Tablet' });
    const card = await renderCard(
      { year: 2026, users: { jens: { user_id: 'id-jens' } }, fallback: { doors: { 5: { effect: LIGHTSHOW } } } },
      hass,
    );

    await clickDoor(card, 5);

    expect(hass.serviceCalls[0].data).toEqual({ tag: 5, person: 'Gäste-Tablet' });
  });
});
