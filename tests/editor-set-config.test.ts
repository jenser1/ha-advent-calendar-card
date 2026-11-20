// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { sameValue } from '../src/editor/shared';
import type { AdventCalendarCardConfig } from '../src/types';
import { TYPE } from './render-card';
import { change, forms, last, renderEditor } from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
});

const ACTION = {
  action: 'light.turn_on',
  target: { entity_id: 'light.baum' },
  data: { effect: 'Fu' },
};

/** Wie HA: tiefe, eingefrorene Kopie der Config. */
function frozenCopy<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown) => {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

describe('Editor: setConfig', () => {
  it('behält die eigenen Objekte, wenn HA eine gleiche Kopie zurückgibt', async () => {
    const { editor, changes } = await renderEditor({});
    const effectForm = forms(editor)[1];
    await change(editor, effectForm, { effect: [ACTION] });
    const sent = last(changes);
    const effect = sent.effect as unknown[];

    editor.setConfig(frozenCopy(sent));
    await editor.updateComplete;

    // Der Aktions-Editor erkennt seine Zeilen an den Objekten – sie müssen dieselben bleiben.
    expect(forms(editor)[1].data.effect).toBe(effect);
  });

  it('übernimmt eine geänderte Config (z. B. aus dem YAML-Editor)', async () => {
    const { editor } = await renderEditor({ title: 'Alt' });
    editor.setConfig({ type: TYPE, title: 'Neu' });
    await editor.updateComplete;
    await Promise.resolve();
    expect(forms(editor)[0].data.title).toBe('Neu');
  });
});

describe('Editor: Aufrufe für HAs Aktions-Editor', () => {
  it('ergänzt bei eingefrorenen Aufrufen data und action – als gleichbleibende Kopie', async () => {
    const { editor } = await renderEditor({});
    const call = Object.freeze({ service: 'light.turn_on', target: Object.freeze({ entity_id: 'light.baum' }) });
    editor.setConfig({ type: TYPE, effect: [call] } as never);
    await editor.updateComplete;
    await Promise.resolve();
    const shown = forms(editor)[1].data.effect as Record<string, unknown>[];
    expect(shown[0]).toEqual({ action: 'light.turn_on', target: { entity_id: 'light.baum' }, data: {} });
    expect(Object.isFrozen(shown[0])).toBe(false);

    // Neu gerendert: dieselbe Kopie, damit die Zeile offen bleibt.
    editor.requestUpdate();
    await editor.updateComplete;
    await Promise.resolve();
    expect((forms(editor)[1].data.effect as unknown[])[0]).toBe(shown[0]);
  });

  it('ergänzt neue Aufrufe aus dem Formular direkt (gleiches Objekt)', async () => {
    const { editor, changes } = await renderEditor({});
    const fresh = { action: 'light.set_effect', target: { entity_id: 'light.baum' } };
    await change(editor, forms(editor)[1], { effect: [fresh] });
    const sent = last(changes).effect as unknown[];
    expect(sent[0]).toBe(fresh);
    expect(fresh).toEqual({ action: 'light.set_effect', target: { entity_id: 'light.baum' }, data: {} });
  });

  it('lässt andere Aktionen (z. B. delay) unverändert', async () => {
    const { editor, changes } = await renderEditor({});
    const delay = { delay: { seconds: 2 } };
    await change(editor, forms(editor)[1], { effect: [delay] });
    expect(last(changes).effect).toEqual([{ delay: { seconds: 2 } }]);
  });
});

describe('sameValue', () => {
  it('vergleicht Inhalte, nicht Objekte', () => {
    const a: AdventCalendarCardConfig = { type: TYPE, effect: [ACTION], snow: true };
    expect(sameValue(a, frozenCopy(a))).toBe(true);
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameValue(a, { ...a, snow: false })).toBe(false);
    expect(sameValue({ a: [1] }, { a: { 0: 1 } })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue(new Date(1), new Date(1))).toBe(true);
    expect(sameValue(null, {})).toBe(false);
  });
});
