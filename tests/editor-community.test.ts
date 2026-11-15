// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TYPE } from './render-card';
import { change, forms, last, renderEditor, tabElement } from './render-editor';

vi.mock('../src/edition', () => ({
  COMMUNITY_CALENDAR: { year: 2026, doors: { 1: { text: 'Für alle' } } },
}));

afterEach(() => {
  document.body.replaceChildren();
});

describe('Editor der Community-Edition', () => {
  it('zeigt nur „Allgemein“, ohne Tab-Leiste', async () => {
    const { editor } = await renderEditor({});
    const tabs = editor.shadowRoot!.querySelector<HTMLElement>('.tabs')!;

    expect(tabs.hidden).toBe(true);
    expect([...tabs.querySelectorAll('.tab')].map((tab) => tab.textContent?.trim())).toEqual(['Allgemein']);
    expect(tabElement(editor).tagName.toLowerCase()).toBe('advent-calendar-editor-general');
  });

  it('erklärt die Edition und bietet weder Jahr noch Inhaltsquelle an', async () => {
    const { editor } = await renderEditor({});

    const intro = tabElement(editor).shadowRoot!.querySelector('.community')?.textContent;
    expect(intro?.replace(/\s+/g, ' ')).toContain('Eigene Kalender mit eigenen Türchen kommen 2027');
    const fields = forms(editor)[0].schema.map((field) => field.name);
    expect(fields).toEqual(['title', 'hide_title', 'theme', 'snow', 'shuffle', 'empty_text', 'effect', 'debug_date']);
  });

  it('schreibt nur erlaubte Optionen in die Config', async () => {
    const { editor, changes } = await renderEditor({});

    await change(editor, forms(editor)[0], { theme: 'kids', snow: true });

    expect(last(changes)).toEqual({ type: TYPE, theme: 'kids', snow: true });
  });

  it('nimmt einen eigenen Effekt aus dem Aktions-Editor auf und entfernt ihn wieder', async () => {
    const { editor, changes } = await renderEditor({});
    const effect = [{ action: 'script.turn_on', target: { entity_id: 'script.advent' } }];

    await change(editor, forms(editor)[0], { effect });
    expect(last(changes)).toEqual({ type: TYPE, effect });

    await change(editor, forms(editor)[0], { effect: [] });
    expect(last(changes)).toEqual({ type: TYPE });
  });
});
