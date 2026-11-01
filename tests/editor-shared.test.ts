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
  type FormElement,
} from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
});

type CardConfig = Omit<AdventCalendarCardConfig, 'type'>;

async function sharedTab(config: CardConfig, hass = mockHass({ isAdmin: true })) {
  const result = await renderEditor(config, { hass });
  await openTab(result.editor, 'Gemeinsam');
  return result;
}

const settingsForm = (editor: Editor) => forms(editor)[0];

function modeForm(editor: Editor) {
  return deepQueryAll<FormElement>(tabElement(editor).shadowRoot!, 'ha-form.mode')[0];
}

async function selectDay(editor: Editor, day: number) {
  await click(editor, deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, '.cell')[day - 1]);
}

async function addBlock(editor: Editor, block: string) {
  await click(
    editor,
    deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, `.add-block[data-block="${block}"]`)[0],
  );
}

describe('Einstellungen', () => {
  it('setzt Modus, „einmal pro Tag“ und Helfer und lässt Standardwerte weg', async () => {
    const { editor, changes } = await sharedTab({});

    await change(editor, settingsForm(editor), { mode: 'replace', effect_helper: 'input_text.adventskalender' });
    expect(last(changes)).toEqual({
      type: TYPE,
      shared: { mode: 'replace', effect_helper: 'input_text.adventskalender' },
    });

    await change(editor, settingsForm(editor), { mode: 'merge', effect_helper: '' });
    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('blendet den Helfer aus, wenn „einmal pro Tag“ aus ist', async () => {
    const { editor, changes } = await sharedTab({});
    expect(settingsForm(editor).schema.map((f) => f.name)).toContain('effect_helper');

    await change(editor, settingsForm(editor), { effect_once: false });

    expect(last(changes).shared).toEqual({ effect_once: false });
    expect(settingsForm(editor).schema.map((f) => f.name)).not.toContain('effect_helper');
  });

  it('wählt den Helfer mit einem Entity-Picker für Text-Helfer', async () => {
    const { editor } = await sharedTab({});
    const helperField = settingsForm(editor).schema.find((f) => f.name === 'effect_helper') as unknown as {
      selector: unknown;
    };
    expect(helperField.selector).toEqual({ entity: { domain: 'input_text' } });
  });

  it('zeigt den Hinweis, wenn ein gemeinsamer Effekt keinen Helfer hat', async () => {
    const { editor } = await sharedTab({
      shared: { doors: { 6: { effect: { action: 'script.advent_nikolaus' } } } },
    });
    expect(tabElement(editor).shadowRoot!.querySelector('.notice')?.textContent).toContain(
      'shared.effect_helper',
    );
  });
});

describe('Gemeinsame Türchen', () => {
  it('legt gemeinsame Türchen an und entfernt shared, wenn alles leer ist', async () => {
    const { editor, changes } = await sharedTab({ users: { jens: {} } });
    await selectDay(editor, 6);
    await addBlock(editor, 'text');

    expect(last(changes)).toEqual({ type: TYPE, users: { jens: {} }, shared: { doors: { 6: { text: '' } } } });

    const remove = deepQueryAll<HTMLElement>(tabElement(editor).shadowRoot!, '.block[data-block="text"] .remove')[0];
    await click(editor, remove as HTMLButtonElement);
    expect(last(changes)).toEqual({ type: TYPE, users: { jens: {} } });
  });

  it('setzt einen eigenen Modus pro Türchen, der immer vorne steht', async () => {
    const { editor, changes } = await sharedTab({ shared: { mode: 'off', doors: { 24: { text: 'Frohe Weihnachten' } } } });
    await selectDay(editor, 24);

    expect(modeForm(editor).data).toEqual({ mode: 'default' });
    await change(editor, modeForm(editor), { mode: 'replace' });
    expect(Object.entries(last(changes).shared!.doors![24]!)).toEqual([
      ['mode', 'replace'],
      ['text', 'Frohe Weihnachten'],
    ]);

    await change(editor, modeForm(editor), { mode: 'default' });
    expect(last(changes).shared!.doors![24]).toEqual({ text: 'Frohe Weihnachten' });
  });

  it('nennt den allgemeinen Modus in der Auswahl „Wie oben“', async () => {
    const { editor } = await sharedTab({ shared: { mode: 'replace' } });
    const options = (modeForm(editor).schema[0] as unknown as {
      selector: { select: { options: { label: string }[] } };
    }).selector.select.options;
    expect(options[0].label).toBe('Wie oben (Statt persönlich – alle sehen dasselbe)');
  });

  it('behält den Modus vorne, wenn Bausteine verschoben werden', async () => {
    const { editor, changes } = await sharedTab({
      shared: { doors: { 6: { mode: 'replace', text: 'Nikolaus', task: 'Stiefel putzen' } } },
    });
    await selectDay(editor, 6);

    const down = deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, '.block[data-block="text"] .down')[0];
    await click(editor, down);

    expect(Object.keys(last(changes).shared!.doors![6]!)).toEqual(['mode', 'task', 'text']);
  });

  it('zeigt im Test nur den gemeinsamen Teil, ohne mode', async () => {
    const { editor, changes } = await sharedTab({
      shared: { doors: { 6: { mode: 'replace', text: 'Nikolaus!' } } },
    });
    await selectDay(editor, 6);
    await click(editor, buttons(editor, 'Türchen 6 testen')[0]);

    const dialog = deepQueryAll<HTMLElement & { open: boolean; content: unknown; sharedContent: unknown }>(
      tabElement(editor).shadowRoot!,
      'advent-calendar-dialog',
    )[0];
    expect(dialog.open).toBe(true);
    expect(dialog.sharedContent).toEqual({ text: 'Nikolaus!' });
    expect(changes).toHaveLength(0);
  });

  it('löst den gemeinsamen Effekt zum Testen aus, ohne den Merker zu setzen', async () => {
    const hass = mockHass({
      isAdmin: true,
      services: ['script.advent_nikolaus', 'input_text.set_value'],
      states: { 'input_text.adventskalender': '' },
    });
    const { editor } = await sharedTab(
      {
        shared: {
          effect_helper: 'input_text.adventskalender',
          doors: { 6: { effect: { action: 'script.advent_nikolaus' } } },
        },
      },
      hass,
    );
    await selectDay(editor, 6);
    await click(editor, buttons(editor, 'Effekt auslösen')[0]);

    expect(hass.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual(['script.advent_nikolaus']);
    expect(hass.states!['input_text.adventskalender'].state).toBe('');
  });
});
