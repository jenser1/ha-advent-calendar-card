// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockHass } from './mock-hass';
import { TYPE } from './render-card';
import {
  buttons,
  change,
  click,
  deepQueryAll,
  forms,
  last,
  openTab,
  renderEditor,
  tabElement,
  type Editor,
} from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
});

type CardConfig = Omit<AdventCalendarCardConfig, 'type'>;

async function doorsTab(config: CardConfig, hass = mockHass({ isAdmin: true })) {
  const result = await renderEditor(config, { hass });
  await openTab(result.editor, 'Türchen');
  return result;
}

function cells(editor: Editor) {
  return deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, '.cell');
}

async function selectDay(editor: Editor, day: number) {
  await click(editor, cells(editor)[day - 1]);
}

async function addBlock(editor: Editor, block: string) {
  const button = deepQueryAll<HTMLButtonElement>(
    tabElement(editor).shadowRoot!,
    `.add-block[data-block="${block}"]`,
  )[0];
  await click(editor, button);
}

function blockForm(editor: Editor, block: string) {
  const box = deepQueryAll<HTMLElement>(tabElement(editor).shadowRoot!, `.block[data-block="${block}"]`)[0];
  return box.querySelector('ha-form') as unknown as ReturnType<typeof forms>[number];
}

function blockButton(editor: Editor, block: string, kind: 'up' | 'down' | 'remove') {
  const box = deepQueryAll<HTMLElement>(tabElement(editor).shadowRoot!, `.block[data-block="${block}"]`)[0];
  return box.querySelector<HTMLButtonElement>(`.${kind}`)!;
}

function chips(editor: Editor) {
  return deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, '.chip');
}

const family: CardConfig = {
  users: { jens: { doors: { 1: { text: 'Eins' } } }, anna: {} },
};

describe('Kalender und Raster', () => {
  it('bietet alle Personen an, den Fallback nur wenn eingeschaltet', async () => {
    const { editor } = await doorsTab(family);
    expect(chips(editor).map((c) => c.textContent?.trim())).toEqual(['jens', 'anna']);

    document.body.replaceChildren();
    const withFallback = await doorsTab({ ...family, fallback: {} });
    expect(chips(withFallback.editor).map((c) => c.textContent?.trim())).toEqual(['jens', 'anna', 'Fallback']);
  });

  it('markiert gefüllte Türchen im Raster', async () => {
    const { editor } = await doorsTab(family);
    expect(cells(editor)).toHaveLength(24);
    expect(cells(editor)[0].classList.contains('filled')).toBe(true);
    expect(cells(editor)[0].textContent).toContain('📝');
    expect(cells(editor)[1].classList.contains('filled')).toBe(false);
  });

  it('bearbeitet die Türchen der gewählten Person', async () => {
    const { editor, changes } = await doorsTab(family);
    await click(editor, chips(editor)[1]);
    await selectDay(editor, 3);
    await addBlock(editor, 'task');

    expect(last(changes).users).toEqual({
      jens: { doors: { 1: { text: 'Eins' } } },
      anna: { doors: { 3: { task: '' } } },
    });
  });

  it('nutzt ohne Personen den Kalender für alle (Fallback)', async () => {
    const { editor, changes } = await doorsTab({});
    expect(tabElement(editor).shadowRoot!.querySelector('.intro')?.textContent).toContain('Ohne Personen');

    await selectDay(editor, 24);
    await addBlock(editor, 'text');

    expect(last(changes)).toEqual({ type: TYPE, fallback: { doors: { 24: { text: '' } } } });
  });
});

describe('Bausteine bearbeiten', () => {
  it('fügt Text mit Lösung hinzu und füllt ihn aus', async () => {
    const { editor, changes } = await doorsTab(family);
    await selectDay(editor, 5);
    await addBlock(editor, 'text');
    await change(editor, blockForm(editor, 'text'), { text: 'Was ist grün?', answer: 'Ein Frosch' });

    expect(last(changes).users!.jens!.doors![5]).toEqual({ text: 'Was ist grün?', answer: 'Ein Frosch' });

    await change(editor, blockForm(editor, 'text'), { answer: '' });
    expect(last(changes).users!.jens!.doors![5]).toEqual({ text: 'Was ist grün?' });
  });

  it('speichert Links als Objekt und lässt kind „web“ weg', async () => {
    const { editor, changes } = await doorsTab(family);
    await selectDay(editor, 5);
    await addBlock(editor, 'link');

    await change(editor, blockForm(editor, 'link'), { url: 'https://example.com', title: 'Angebot', kind: 'web' });
    expect(last(changes).users!.jens!.doors![5]).toEqual({ link: { url: 'https://example.com', title: 'Angebot' } });

    await change(editor, blockForm(editor, 'link'), { kind: 'shop' });
    expect(last(changes).users!.jens!.doors![5]).toEqual({
      link: { url: 'https://example.com', title: 'Angebot', kind: 'shop' },
    });
  });

  it('übernimmt Effekte aus dem HA-Aktions-Editor', async () => {
    const { editor, changes } = await doorsTab(family);
    await selectDay(editor, 5);
    await addBlock(editor, 'effect');
    expect(blockForm(editor, 'effect').data).toEqual({ effect: [] });

    const actions = [{ action: 'light.turn_on', metadata: {}, target: { entity_id: 'light.flur' } }];
    await change(editor, blockForm(editor, 'effect'), { effect: actions });

    expect(last(changes).users!.jens!.doors![5]).toEqual({ effect: actions });
  });

  it('bietet jeden Baustein nur einmal an', async () => {
    const { editor } = await doorsTab({ users: { jens: { doors: { 5: { text: 'x', image: '/local/a.gif' } } } } });
    await selectDay(editor, 5);
    const offered = deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, '.add-block').map(
      (b) => b.dataset.block,
    );
    expect(offered).toEqual(['task', 'link', 'video', 'effect']);
  });

  it('verschiebt Bausteine, die Lösung bleibt beim Text', async () => {
    const { editor, changes } = await doorsTab({
      users: { jens: { doors: { 5: { text: 'Rätsel', answer: 'Lösung', image: '/local/a.gif', task: 'Kekse' } } } },
    });
    await selectDay(editor, 5);

    await click(editor, blockButton(editor, 'text', 'down'));
    expect(Object.keys(last(changes).users!.jens!.doors![5]!)).toEqual(['image', 'text', 'answer', 'task']);

    expect(blockButton(editor, 'image', 'up').disabled).toBe(true);
    expect(blockButton(editor, 'task', 'down').disabled).toBe(true);
  });

  it('entfernt Bausteine und das Türchen, wenn es leer wird', async () => {
    const { editor, changes } = await doorsTab({
      users: { jens: { doors: { 1: { text: 'Eins' }, 5: { text: 'Rätsel', answer: 'Lösung', task: 'Kekse' } } } },
    });
    await selectDay(editor, 5);

    await click(editor, blockButton(editor, 'text', 'remove'));
    expect(last(changes).users!.jens!.doors![5]).toEqual({ task: 'Kekse' });

    await click(editor, blockButton(editor, 'task', 'remove'));
    expect(last(changes).users!.jens!.doors).toEqual({ 1: { text: 'Eins' } });
  });

  it('leert ein Türchen erst nach Rückfrage', async () => {
    const { editor, changes } = await doorsTab(family);
    await selectDay(editor, 1);

    await click(editor, buttons(editor, 'Türchen leeren')[0]);
    expect(changes).toHaveLength(0);
    await click(editor, buttons(editor, 'Ja, leeren')[0]);

    expect(last(changes).users).toEqual({ jens: {}, anna: {} });
  });
});

describe('Türchen testen', () => {
  it('zeigt den Inhalt im Dialog, wie ihn die Person sieht – ohne zu speichern', async () => {
    const { editor, changes } = await doorsTab({
      users: { jens: { doors: { 6: { text: 'Für Jens' } } } },
      shared: { doors: { 6: { text: 'Für alle' } } },
    });
    await selectDay(editor, 6);

    await click(editor, buttons(editor, 'Türchen 6 testen')[0]);

    const dialog = deepQueryAll<HTMLElement & { open: boolean; content: unknown; sharedContent: unknown }>(
      tabElement(editor).shadowRoot!,
      'advent-calendar-dialog',
    )[0];
    expect(dialog.open).toBe(true);
    expect(dialog.content).toEqual({ text: 'Für Jens' });
    expect(dialog.sharedContent).toEqual({ text: 'Für alle' });
    expect(changes).toHaveLength(0);
  });

  it('löst Effekte nur über den eigenen Button aus', async () => {
    const hass = mockHass({ isAdmin: true, services: ['script.advent_lichtshow'] });
    const { editor } = await doorsTab(
      { users: { jens: { doors: { 4: { effect: { action: 'script.advent_lichtshow' } } } } } },
      hass,
    );
    await selectDay(editor, 4);
    await click(editor, buttons(editor, 'Türchen 4 testen')[0]);
    expect(hass.serviceCalls).toEqual([]);

    await click(editor, buttons(editor, 'Effekt auslösen')[0]);

    expect(hass.serviceCalls).toMatchObject([
      { domain: 'script', service: 'advent_lichtshow', data: { tag: 4, person: 'jens' } },
    ]);
    expect(tabElement(editor).shadowRoot!.querySelector('.effect-message')?.textContent).toContain(
      'Effekt ausgelöst',
    );
  });

  it('zeigt „Effekt auslösen“ nur bei Türchen mit Effekt', async () => {
    const { editor } = await doorsTab(family);
    await selectDay(editor, 1);
    expect(buttons(editor, 'Effekt auslösen')).toHaveLength(0);
  });
});
