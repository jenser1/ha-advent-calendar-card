// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DoorContent } from '../src/types';
import { mockHass } from './mock-hass';
import { KEY, doors, renderCard, setNow, settle, toasts } from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Karte am 5.12.2026 mit Inhalten für Jens rendern. */
async function cardWith(
  content: Record<number, DoorContent | null>,
  options: { opened?: Record<number, string>; emptyText?: string } = {},
) {
  setNow('2026-12-05T12:00:00Z');
  const hass = mockHass({
    userData: options.opened ? { [KEY]: { version: 1, opened: options.opened } } : {},
  });
  const card = await renderCard(
    { year: 2026, empty_text: options.emptyText, users: { jens: { doors: content } } },
    hass,
  );
  return { card, hass };
}

function dialogOf(card: HTMLElement) {
  return card.shadowRoot!.querySelector('advent-calendar-dialog')!;
}

/** Inhalt des Dialogs (ohne Kopfzeile) */
function inner(card: HTMLElement) {
  return dialogOf(card).shadowRoot!.querySelector('.inner');
}

async function clickDoor(card: HTMLElementTagNameMap['advent-calendar-card'], day: number) {
  doors(card)[day - 1].click();
  await settle(card);
  await settle(dialogOf(card));
}

describe('Dialog öffnen und schließen', () => {
  it('öffnet beim Klick auf das heutige Türchen den Inhalt', async () => {
    const { card } = await cardWith({ 5: { text: 'Hallo Jens!' } });

    await clickDoor(card, 5);

    const dialog = dialogOf(card);
    expect(dialog.open).toBe(true);
    expect(dialog.shadowRoot!.querySelector('dialog')!.open).toBe(true);
    expect(dialog.shadowRoot!.querySelector('h2')?.textContent).toBe('Türchen 5');
    expect(inner(card)?.querySelector('.text')?.textContent).toBe('Hallo Jens!');
  });

  it('zeigt geöffnete Türchen erneut an, ohne neu zu speichern', async () => {
    const { card, hass } = await cardWith(
      { 3: { text: 'Drei' } },
      { opened: { 3: '2026-12-03T08:00:00Z' } },
    );

    await clickDoor(card, 3);

    expect(inner(card)?.querySelector('.text')?.textContent).toBe('Drei');
    expect(hass.calls.some((call) => call.type === 'frontend/set_user_data')).toBe(false);
  });

  it('öffnet für gesperrte und verpasste Türchen keinen Dialog', async () => {
    const { card } = await cardWith({ 4: { text: 'vier' }, 6: { text: 'sechs' } });

    await clickDoor(card, 4);
    await clickDoor(card, 6);

    expect(dialogOf(card).open).toBe(false);
  });

  it('meldet das Schließen nicht an Home Assistant (HAs eigenes „dialog-closed“ erwartet detail.dialog)', async () => {
    const { card } = await cardWith({ 5: { text: 'Hallo' } });
    const escaped: string[] = [];
    const listen = (event: Event) => escaped.push(event.type);
    for (const type of ['dialog-closed', 'advent-dialog-close']) {
      document.addEventListener(type, listen);
    }
    await clickDoor(card, 5);

    dialogOf(card).shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
    await settle(card);

    for (const type of ['dialog-closed', 'advent-dialog-close']) {
      document.removeEventListener(type, listen);
    }
    expect(escaped).toEqual([]);
    expect(dialogOf(card).open).toBe(false);
  });

  it('schließt per ✕ und entfernt den Inhalt (stoppt z. B. Videos)', async () => {
    const { card } = await cardWith({ 5: { video: 'https://youtu.be/dQw4w9WgXcQ' } });
    await clickDoor(card, 5);
    expect(inner(card)?.querySelector('iframe')).not.toBeNull();

    dialogOf(card).shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
    await settle(card);
    await settle(dialogOf(card));

    expect(dialogOf(card).open).toBe(false);
    expect(dialogOf(card).shadowRoot!.querySelector('dialog')!.open).toBe(false);
    expect(inner(card)).toBeNull();
  });
});

describe('Bausteine im Dialog', () => {
  it('zeigt die Bausteine in der Reihenfolge aus der YAML', async () => {
    const { card } = await cardWith({
      5: { image: '/local/advent/05.gif', text: 'Unter dem Bild', task: 'Kekse backen' },
    });
    await clickDoor(card, 5);

    const children = [...inner(card)!.children].map((el) => el.className || el.tagName);
    expect(children).toEqual(['HEADER', 'image', 'text', 'task ']);
    expect(inner(card)!.querySelector('img')?.getAttribute('src')).toBe('/local/advent/05.gif');
  });

  it('zeigt die Lösung eines Rätsels erst auf Knopfdruck', async () => {
    const { card } = await cardWith({ 5: { text: 'Was ist grün?', answer: 'Ein Frosch' } });
    await clickDoor(card, 5);
    expect(inner(card)!.querySelector('.answer')).toBeNull();

    inner(card)!.querySelector<HTMLButtonElement>('.reveal')!.click();
    await settle(dialogOf(card));

    expect(inner(card)!.querySelector('.answer')?.textContent).toContain('Ein Frosch');
  });

  it('zeigt einen Standardtext für leere Türchen, änderbar über empty_text', async () => {
    const { card } = await cardWith({});
    await clickDoor(card, 5);
    expect(inner(card)!.querySelector('.empty')?.textContent).toContain('Heute ist das Türchen leer');

    document.body.replaceChildren();
    const custom = await cardWith({ 5: { effect: { service: 'script.turn_on' } } }, {
      emptyText: 'Schau mal ins Wohnzimmer!',
    });
    await clickDoor(custom.card, 5);
    expect(inner(custom.card)!.querySelector('.empty')?.textContent).toBe('Schau mal ins Wohnzimmer!');
  });

  it('bettet YouTube über youtube-nocookie ein und eigene Videos als <video>', async () => {
    const { card } = await cardWith({ 5: { video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30' } });
    await clickDoor(card, 5);
    expect(inner(card)!.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30',
    );

    document.body.replaceChildren();
    const file = await cardWith({ 5: { video: '/local/advent/schnee.mp4' } });
    await clickDoor(file.card, 5);
    expect(inner(file.card)!.querySelector('video')?.getAttribute('src')).toBe('/local/advent/schnee.mp4');
  });

  it('zeigt Links als Karte, die in einem neuen Tab öffnet', async () => {
    const { card } = await cardWith({
      5: { link: { url: 'https://example.com/angebot', title: 'Adventsangebot', kind: 'shop' } },
    });
    await clickDoor(card, 5);

    const link = inner(card)!.querySelector<HTMLAnchorElement>('a.link')!;
    expect(link.getAttribute('href')).toBe('https://example.com/angebot');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.querySelector('.link-title')?.textContent).toBe('Adventsangebot');
    expect(link.querySelector('ha-icon')?.getAttribute('icon')).toBe('mdi:shopping');
  });
});

describe('Gutschein erledigt', () => {
  it('speichert den Haken und nimmt ihn wieder weg', async () => {
    const { card, hass } = await cardWith({ 5: { task: 'Frühstück ans Bett 🥐' } });
    await clickDoor(card, 5);
    const toggle = () => inner(card)!.querySelector<HTMLButtonElement>('.done-toggle')!;
    expect(toggle().textContent?.trim()).toBe('Als erledigt markieren');

    toggle().click();
    await settle(card);
    await settle(dialogOf(card));
    expect(toggle().textContent?.trim()).toBe('Erledigt ✔');
    expect(hass.userData.get(KEY)).toMatchObject({ done: { 5: '2026-12-05T12:00:00.000Z' } });

    toggle().click();
    await settle(card);
    await settle(dialogOf(card));
    expect(toggle().textContent?.trim()).toBe('Als erledigt markieren');
    expect(hass.userData.get(KEY)).toMatchObject({ done: {} });
  });

  it('nimmt den Haken zurück, wenn Speichern scheitert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { card, hass } = await cardWith({ 5: { task: 'Kekse backen' } }, {
      opened: { 5: '2026-12-05T08:00:00Z' },
    });
    const messages = toasts(card);
    await clickDoor(card, 5);
    hass.failSave = true;

    inner(card)!.querySelector<HTMLButtonElement>('.done-toggle')!.click();
    await settle(card);
    await settle(dialogOf(card));

    expect(inner(card)!.querySelector('.done-toggle')?.textContent?.trim()).toBe('Als erledigt markieren');
    expect(messages).toEqual(['Konnte nicht gespeichert werden. Bitte nochmal versuchen.']);
  });
});

describe('GitHub-Karte', () => {
  async function repoCard(url: string, title?: string) {
    const { card } = await cardWith({ 5: { link: { url, title, kind: 'github' } } });
    await clickDoor(card, 5);
    const repo = inner(card)!.querySelector('advent-calendar-repo-card')!;
    await settle(repo);
    return repo.shadowRoot!;
  }

  it('lädt Beschreibung und Sterne von der GitHub-API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        full_name: 'jenser1/ha-vorrat-addon',
        description: 'Vorratsverwaltung für Home Assistant',
        stargazers_count: 1234,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const root = await repoCard('https://github.com/jenser1/ha-vorrat-addon', 'Mein Vorrat-Add-on');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/jenser1/ha-vorrat-addon',
      expect.anything(),
    );
    expect(root.querySelector('.link-title')?.textContent).toBe('Mein Vorrat-Add-on');
    expect(root.querySelector('.link-description')?.textContent).toBe('Vorratsverwaltung für Home Assistant');
    expect(root.querySelector('.link-meta')?.textContent).toBe('⭐ 1.234 · jenser1/ha-vorrat-addon');
  });

  it('nutzt den Cache statt erneut zu laden', async () => {
    // cardWith stellt die Uhr auf den 5.12.2026, 12 Uhr; der Cache ist eine Stunde alt.
    localStorage.setItem(
      'advent-calendar-card:github:jenser1/cached-repo',
      JSON.stringify({
        at: Date.parse('2026-12-05T11:00:00Z'),
        info: { fullName: 'jenser1/cached-repo', stars: 7 },
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const root = await repoCard('https://github.com/jenser1/cached-repo');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(root.querySelector('.link-meta')?.textContent).toBe('⭐ 7 · jenser1/cached-repo');
  });

  it('übersteht ein fetch, das sofort einen Fehler wirft', async () => {
    vi.stubGlobal('fetch', () => {
      throw new TypeError('fetch is not available');
    });

    const root = await repoCard('https://github.com/jenser1/kaputt-repo');

    expect(root.querySelector('.link-meta')?.textContent).toBe('jenser1/kaputt-repo');
  });

  it('zeigt ohne GitHub-Antwort die Angaben aus der Config', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    const root = await repoCard('https://github.com/jenser1/offline-repo', 'Offline-Projekt');

    expect(root.querySelector('.link-title')?.textContent).toBe('Offline-Projekt');
    expect(root.querySelector('.link-meta')?.textContent).toBe('jenser1/offline-repo');
  });
});
