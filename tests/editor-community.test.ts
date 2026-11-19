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
    expect(fields).toEqual(['title', 'hide_title', 'theme', 'snow', 'shuffle', 'advent_candles', 'empty_text', 'debug_date']);
    expect(forms(editor)[1].schema.map((field) => field.name)).toEqual(['light_entity', 'music_entity', 'effect']);
  });

  it('nimmt Licht und Musik aus dem Effekt-Bereich auf', async () => {
    const { editor, changes } = await renderEditor({});

    await change(editor, forms(editor)[1], { light_entity: 'light.wohnzimmer' });
    expect(last(changes)).toEqual({ type: TYPE, effect_light: { entity_id: 'light.wohnzimmer' } });
  });

  it('schreibt nur erlaubte Optionen in die Config', async () => {
    const { editor, changes } = await renderEditor({});

    await change(editor, forms(editor)[0], { theme: 'kids', snow: true });

    expect(last(changes)).toEqual({ type: TYPE, theme: 'kids', snow: true });
  });

  it('nimmt einen eigenen Effekt aus dem Aktions-Editor auf und entfernt ihn wieder', async () => {
    const { editor, changes } = await renderEditor({});
    const effect = [{ action: 'script.turn_on', target: { entity_id: 'script.advent' } }];

    await change(editor, forms(editor)[1], { effect });
    expect(last(changes)).toEqual({ type: TYPE, effect });

    await change(editor, forms(editor)[1], { effect: [] });
    expect(last(changes)).toEqual({ type: TYPE });
  });
});
