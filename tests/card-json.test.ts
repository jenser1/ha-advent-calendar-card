// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockFiles } from './mock-files';
import { mockHass } from './mock-hass';
import { KEY, doors, renderCard, setNow, settle, statuses } from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type CardConfig = Omit<AdventCalendarCardConfig, 'type'>;

const JENS_FILE = '/local/advent/jens.json';
const SHARED_FILE = '/local/advent/shared.json';

const family = (extra: CardConfig = {}): CardConfig => ({
  year: 2026,
  content_source: 'json',
  users: {
    jens: { user_id: 'id-jens', doors: { 6: { text: 'Aus der YAML' } } },
    anna: { user_id: 'id-anna' },
  },
  ...extra,
});

const jens = (options: Parameters<typeof mockHass>[0] = {}) =>
  mockHass({
    userId: 'id-jens',
    services: ['script.turn_on', 'script.advent_nikolaus'],
    entities: ['script.advent_lichtshow', 'script.advent_nikolaus'],
    ...options,
  });

function dialogOf(card: HTMLElement) {
  return card.shadowRoot!.querySelector('advent-calendar-dialog')!;
}

async function openSixth(card: HTMLElementTagNameMap['advent-calendar-card']) {
  doors(card)[5].click();
  await settle(card);
  await settle(card);
}

function errors(card: HTMLElement) {
  return [...card.shadowRoot!.querySelectorAll('.error')].map((el) => el.textContent?.trim());
}

describe('Inhalte aus JSON-Dateien', () => {
  it('lädt die Datei der Person und die gemeinsame und ignoriert die YAML-Türchen', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles({
      [JENS_FILE]: { doors: { 6: { text: 'Aus der Datei' } } },
      [SHARED_FILE]: { doors: { 6: { text: 'Nikolaus für alle' } } },
    });
    const card = await renderCard(family(), jens());

    expect(server.requests).toEqual([JENS_FILE, SHARED_FILE]);
    expect(statuses(card)[5]).toBe('openable');

    await openSixth(card);
    expect(dialogOf(card).content).toEqual({ text: 'Aus der Datei' });
    expect(dialogOf(card).sharedContent).toEqual({ text: 'Nikolaus für alle' });
  });

  it('nutzt einen eigenen Pfad mit {year}', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles({ '/local/kalender/2026/jens.json': { doors: {} } });
    await renderCard(family({ json_path: '/local/kalender/{year}/{person}.json' }), jens());

    expect(server.requests).toEqual(['/local/kalender/2026/jens.json', '/local/kalender/2026/shared.json']);
  });

  it('liest ohne Personen fallback.json', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles({ '/local/advent/fallback.json': { doors: { 6: { text: 'Für alle' } } } });
    const card = await renderCard({ year: 2026, content_source: 'json' }, mockHass());

    expect(server.requests[0]).toBe('/local/advent/fallback.json');
    await openSixth(card);
    expect(dialogOf(card).content).toEqual({ text: 'Für alle' });
  });

  it('lädt keine Datei, wenn es für den Benutzer keinen Kalender gibt', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles();
    const card = await renderCard(family(), mockHass({ userId: 'id-gast', userName: 'Gast' }));

    expect(server.requests).toEqual([]);
    expect(card.shadowRoot!.querySelector('.no-calendar')?.textContent).toBe(
      'Für dich gibt’s noch keinen Kalender 🎅',
    );
  });

  it('lässt Türchen erst öffnen, wenn die Dateien da sind', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens();
    mockFiles({ [JENS_FILE]: { hang: true } });
    const card = await renderCard(family(), hass);

    expect(new Set(statuses(card))).toEqual(new Set([undefined]));
    doors(card)[5].click();
    await settle(card);
    expect(hass.calls.some((call) => call.type === 'frontend/set_user_data')).toBe(false);
  });

  it('löst den Effekt aus der Datei aus', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens();
    mockFiles({
      [JENS_FILE]: {
        doors: { 6: { effect: { action: 'script.turn_on', target: { entity_id: 'script.advent_lichtshow' } } } },
      },
    });
    const card = await renderCard(family(), hass);
    await openSixth(card);

    expect(hass.serviceCalls).toEqual([
      expect.objectContaining({
        domain: 'script',
        service: 'turn_on',
        target: { entity_id: 'script.advent_lichtshow' },
      }),
    ]);
  });

  it('zeigt „noch nicht fertig“, solange die Datei fehlt – Admins mit Pfad', async () => {
    setNow('2026-12-06T12:00:00Z');
    mockFiles();
    const card = await renderCard(family(), jens());

    expect(doors(card)).toHaveLength(0);
    expect(card.shadowRoot!.querySelector('.no-calendar')?.textContent).toBe(
      'Dein Kalender ist noch nicht fertig 🎅',
    );
    expect(card.shadowRoot!.querySelector('.missing-file')).toBeNull();

    const admin = await renderCard(family(), jens({ isAdmin: true }));
    const hint = admin.shadowRoot!.querySelector('.missing-file')?.textContent ?? '';
    expect(hint).toContain('Datei fehlt: /local/advent/jens.json');
    expect(hint).toContain('Auf dem Server: /config/www/advent/jens.json');
  });

  it('meldet Fehler in einer Datei und sperrt die Türchen', async () => {
    setNow('2026-12-06T12:00:00Z');
    mockFiles({
      [JENS_FILE]: { doors: {} },
      [SHARED_FILE]: { raw: '{ kaputt' },
    });
    const card = await renderCard(family(), jens());

    expect(errors(card)).toEqual([expect.stringContaining('„/local/advent/shared.json“ ist kein gültiges JSON')]);
    expect(new Set(statuses(card))).toEqual(new Set([undefined]));
  });

  it('versucht es minütlich erneut, bis die Datei da ist', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-12-06T12:00:00Z'));
    const server = mockFiles();
    const card = await renderCard(family(), jens());
    expect(card.shadowRoot!.querySelector('.no-calendar')).not.toBeNull();

    server.files[JENS_FILE] = { doors: { 6: { text: 'Jetzt da' } } };
    vi.advanceTimersByTime(60_000);
    await settle(card);

    expect(statuses(card)[5]).toBe('openable');
    const requests = server.requests.length;

    // Alles geladen: Beim minütlichen Prüfen wird nicht erneut geladen.
    vi.advanceTimersByTime(60_000);
    await settle(card);
    expect(server.requests).toHaveLength(requests);
  });

  it('lädt die Dateien beim Zurückkehren auf die Ansicht neu', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles({ [JENS_FILE]: { doors: { 6: { text: 'Alt' } } } });
    const card = await renderCard(family(), jens());

    server.files[JENS_FILE] = { doors: { 6: { text: 'Neu' } } };
    card.remove();
    document.body.append(card);
    await settle(card);
    await openSixth(card);

    expect(dialogOf(card).content).toEqual({ text: 'Neu' });
  });

  it('lädt die Dateien nur einmal beim Start', async () => {
    setNow('2026-12-06T12:00:00Z');
    const server = mockFiles({ [JENS_FILE]: { doors: {} } });
    const hass = jens();
    await renderCard(family(), hass);

    expect(server.requests).toEqual([JENS_FILE, SHARED_FILE]);
    expect(hass.calls).toEqual([{ type: 'frontend/get_user_data', key: KEY }]);
  });

  it('lehnt Personen namens shared oder fallback im JSON-Modus ab', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() =>
      card.setConfig({ type: 'custom:advent-calendar-card', content_source: 'json', users: { shared: {} } }),
    ).toThrow('reserviert');
  });
});
