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
