// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { TYPE, settle } from './render-card';
import { buttons, change, forms, last, openTab, renderEditor, tabElement } from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Editor einbinden', () => {
  it('liefert den Editor über getConfigElement', () => {
    const card = customElements.get('advent-calendar-card') as unknown as {
      getConfigElement(): HTMLElement;
    };
    expect(card.getConfigElement().tagName.toLowerCase()).toBe('advent-calendar-card-editor');
  });

  it('meldet genau ein config-changed pro Änderung', async () => {
    const { editor, changes } = await renderEditor({});
    let outer = 0;
    document.body.addEventListener('config-changed', () => outer++);

    await change(editor, forms(editor)[0], { title: 'Hallo' });

    expect(changes).toHaveLength(1);
    expect(outer).toBe(1);
  });
});

describe('Tab „Allgemein“', () => {
  it('übernimmt alle Einstellungen', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: {} } });

    await change(editor, forms(editor)[0], {
      title: 'Familienkalender',
      year: 2026,
      theme: 'kids',
      snow: true,
      shuffle: false,
      empty_text: 'Heute nix 🎄',
      debug_date: '2026-12-05',
    });

    expect(last(changes)).toEqual({
      type: TYPE,
      users: { jens: {} },
      title: 'Familienkalender',
      year: 2026,
      theme: 'kids',
      snow: true,
      shuffle: false,
      empty_text: 'Heute nix 🎄',
      debug_date: '2026-12-05',
    });
  });

  it('lässt Standardwerte aus der Config weg', async () => {
    const { editor, changes } = await renderEditor({
      title: 'X',
      theme: 'kids',
      snow: true,
      shuffle: false,
      year: 2026,
      debug_date: '2026-12-05',
    });

    await change(editor, forms(editor)[0], {
      title: '',
      theme: 'winter',
      snow: false,
      shuffle: true,
      year: undefined,
      debug_date: '',
    });

    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('blendet die Überschrift mit title: "" aus', async () => {
    const { editor, changes } = await renderEditor({ title: 'X' });
    await change(editor, forms(editor)[0], { hide_title: true });
    expect(last(changes)?.title).toBe('');
    expect(forms(editor)[0].data.hide_title).toBe(true);
  });

  it('zeigt das Testdatum nur Admins', async () => {
    const admin = await renderEditor({}, { isAdmin: true });
    const user = await renderEditor({}, { isAdmin: false });
    const names = (editor: HTMLElement) => forms(editor)[0].schema.map((field) => field.name);

    expect(names(admin.editor)).toContain('debug_date');
    expect(names(user.editor)).not.toContain('debug_date');
  });

  it('zeigt ein Testdatum aus dem YAML-Editor (Date) als JJJJ-MM-TT', async () => {
    const { editor } = await renderEditor({ debug_date: new Date(Date.UTC(2026, 11, 5)) });
    expect(forms(editor)[0].data.debug_date).toBe('2026-12-05');
  });
});

describe('Tab „Personen“', () => {
  it('legt Personen mit eindeutigem Namen an', async () => {
    const { editor, changes } = await renderEditor({});
    await openTab(editor, 'Personen');

    buttons(editor, 'Person hinzufügen')[0].click();
    await settle(editor);
    expect(last(changes)?.users).toEqual({ neue_person: {} });

    await settle(tabElement(editor));
    buttons(editor, 'Person hinzufügen')[0].click();
    await settle(editor);
    expect(Object.keys(last(changes)!.users!)).toEqual(['neue_person', 'neue_person_2']);
  });

  it('benennt um, ohne Reihenfolge oder Türchen zu verlieren', async () => {
    const { editor, changes } = await renderEditor({
      users: { jens: { doors: { 1: { text: 'x' } } }, neue_person: {}, oma: {} },
    });
    await openTab(editor, 'Personen');

    await change(editor, forms(editor)[1], { name: 'Anna Maria' });

    expect(last(changes)?.users).toEqual({
      jens: { doors: { 1: { text: 'x' } } },
      'Anna Maria': {},
      oma: {},
    });
  });

  it('lehnt leere und doppelte Namen ab und zeigt den Grund', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: {}, anna: {} } });
    await openTab(editor, 'Personen');

    await change(editor, forms(editor)[1], { name: 'JENS' });
    expect(Object.keys(last(changes)!.users!)).toEqual(['jens', 'anna']);
    expect(tabElement(editor).shadowRoot!.querySelector('.error-text')?.textContent).toBe(
      'Diesen Namen gibt es schon.',
    );
    expect(forms(editor)[1].data.name).toBe('JENS');

    await change(editor, forms(editor)[1], { name: '' });
    expect(tabElement(editor).shadowRoot!.querySelector('.error-text')?.textContent).toBe(
      'Der Name darf nicht leer sein.',
    );
  });

  it('setzt HA-Benutzer und Theme und entfernt sie wieder', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: {} } });
    await openTab(editor, 'Personen');

    await change(editor, forms(editor)[0], { user_id: 'id-jens', theme: 'nerd' });
    expect(last(changes)?.users).toEqual({ jens: { user_id: 'id-jens', theme: 'nerd' } });

    await change(editor, forms(editor)[0], { user_id: '', theme: 'card' });
    expect(last(changes)?.users).toEqual({ jens: {} });
  });

  it('warnt, wenn ein HA-Benutzer mehreren Personen zugeordnet ist', async () => {
    const { editor } = await renderEditor({ users: { jens: { user_id: 'a' }, papa: { user_id: 'a' } } });
    await openTab(editor, 'Personen');
    expect(tabElement(editor).shadowRoot!.querySelectorAll('.error-text')).toHaveLength(2);
  });

  it('löscht Personen erst nach Rückfrage', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: { doors: { 1: {} } }, anna: {} } });
    await openTab(editor, 'Personen');

    buttons(editor, 'Entfernen')[0].click();
    await settle(tabElement(editor));
    expect(changes).toHaveLength(0);
    expect(tabElement(editor).shadowRoot!.querySelector('.confirm')?.textContent).toContain(
      'Mit 1 Türchen löschen?',
    );

    buttons(editor, 'Ja, löschen')[0].click();
    await settle(editor);
    expect(last(changes)?.users).toEqual({ anna: {} });
  });

  it('entfernt users ganz, wenn die letzte Person gelöscht wird', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: {} } });
    await openTab(editor, 'Personen');

    buttons(editor, 'Entfernen')[0].click();
    await settle(tabElement(editor));
    buttons(editor, 'Ja, löschen')[0].click();
    await settle(editor);

    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('schaltet den Fallback an und aus', async () => {
    const { editor, changes } = await renderEditor({ users: { jens: {} } });
    await openTab(editor, 'Personen');
    const fallbackForm = () => last(forms(editor));

    await change(editor, fallbackForm(), { enabled: true });
    expect(last(changes)?.fallback).toEqual({});

    await change(editor, fallbackForm(), { theme: 'kids' });
    expect(last(changes)?.fallback).toEqual({ theme: 'kids' });

    await change(editor, fallbackForm(), { enabled: false });
    expect(last(changes)).not.toHaveProperty('fallback');
  });

  it('fragt vor dem Abschalten eines Fallbacks mit Türchen nach', async () => {
    const { editor, changes } = await renderEditor({ fallback: { doors: { 1: { text: 'x' } } } });
    await openTab(editor, 'Personen');

    await change(editor, last(forms(editor)), { enabled: false });
    expect(changes).toHaveLength(0);
    expect(last(forms(editor)).data.enabled).toBe(true);

    buttons(editor, 'Ja, löschen')[0].click();
    await settle(editor);
    expect(last(changes)).toEqual({ type: TYPE });
  });
});
