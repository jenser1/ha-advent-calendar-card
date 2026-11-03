// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockFiles } from './mock-files';
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
  settleEditor,
  tabElement,
  type Editor,
} from './render-editor';

type CardConfig = Omit<AdventCalendarCardConfig, 'type'>;

const JENS_FILE = '/local/advent/jens.json';
const SHARED_FILE = '/local/advent/shared.json';

let downloads: { name: string; text: Promise<string> }[];

beforeEach(() => {
  downloads = [];
  let blob: Blob | undefined;
  URL.createObjectURL = vi.fn((object: Blob | MediaSource) => {
    blob = object as Blob;
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, text: blob!.text() });
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const family = (extra: CardConfig = {}): CardConfig => ({
  year: 2026,
  content_source: 'json',
  users: { jens: { user_id: 'id-jens' }, anna: {} },
  ...extra,
});

/** Öffnet einen Tab und wartet, bis die Dateien geladen sind. */
async function openTabWithFiles(editor: Editor, label: string) {
  await openTab(editor, label);
  await settleEditor(editor);
}

function query<T extends Element = HTMLElement>(editor: Editor, selector: string): T[] {
  return deepQueryAll<T>(tabElement(editor).shadowRoot!, selector);
}

function text(editor: Editor, selector: string): string {
  return query(editor, selector)[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Tab Allgemein: Inhaltsquelle', () => {
  it('stellt auf JSON um und zeigt dann den Pfad', async () => {
    const { editor, changes } = await renderEditor({});
    expect(forms(editor)[0].schema.map((f) => f.name)).not.toContain('json_path');

    await change(editor, forms(editor)[0], { content_source: 'json' });
    expect(last(changes)).toEqual({ type: TYPE, content_source: 'json' });

    editor.setConfig(last(changes));
    await settleEditor(editor);
    expect(forms(editor)[0].data.json_path).toBe('/local/advent/{person}.json');

    await change(editor, forms(editor)[0], { content_source: 'yaml' });
    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('übernimmt einen gültigen Pfad und lässt den Standardpfad weg', async () => {
    const { editor, changes } = await renderEditor({ content_source: 'json' });

    await change(editor, forms(editor)[0], { json_path: '/local/advent/{year}/{person}.json' });
    expect(last(changes).json_path).toBe('/local/advent/{year}/{person}.json');

    await change(editor, forms(editor)[0], { json_path: '/local/advent/{person}.json' });
    expect(last(changes)).not.toHaveProperty('json_path');
  });

  it('behält ungültige Pfade als Entwurf mit Fehlermeldung', async () => {
    const { editor, changes } = await renderEditor({
      content_source: 'json',
      json_path: '/local/kalender/{person}.json',
    });

    await change(editor, forms(editor)[0], { json_path: '/local/kalender/jens.json' });

    expect(last(changes).json_path).toBe('/local/kalender/{person}.json');
    expect(forms(editor)[0].data.json_path).toBe('/local/kalender/jens.json');
    expect(text(editor, '.path-error')).toContain('{person}');
  });

  it('stellt nicht um, solange eine Person „shared“ heißt', async () => {
    const { editor, changes } = await renderEditor({ users: { shared: {} } });

    await change(editor, forms(editor)[0], { content_source: 'json' });

    expect(last(changes)).not.toHaveProperty('content_source');
    expect(text(editor, '.source-error')).toContain('Benenne zuerst die Person „shared“ um');
  });
});

describe('Tab Personen im JSON-Modus', () => {
  it('nennt die Datei jeder Person und reserviert fallback/shared', async () => {
    mockFiles();
    const { editor, changes } = await renderEditor(family({ fallback: {} }));
    await openTab(editor, 'Personen');

    expect(query(editor, '.file-hint').map((el) => el.textContent)).toEqual([
      `Türchen aus ${JENS_FILE}`,
      'Türchen aus /local/advent/anna.json',
      'Türchen aus /local/advent/fallback.json',
    ]);

    await change(editor, forms(editor)[1], { name: 'Fallback' });
    expect(changes).toHaveLength(1);
    expect(Object.keys(last(changes).users!)).toEqual(['jens', 'anna']);
    expect(text(editor, '.error-text')).toContain('gehören „fallback“ und „shared“');
  });
});

describe('Tab Türchen im JSON-Modus', () => {
  it('zeigt Pfad, Ort auf dem Server, Status und die Türchen aus der Datei', async () => {
    mockFiles({ [JENS_FILE]: { doors: { 1: { text: 'Hallo' }, 6: { task: 'Stiefel putzen' } } } });
    const { editor } = await renderEditor(family());
    await openTabWithFiles(editor, 'Türchen');

    expect(text(editor, '.file-path')).toBe(`📄 ${JENS_FILE}`);
    expect(text(editor, '.box.file')).toContain('Auf dem Server: /config/www/advent/jens.json');
    expect(text(editor, '.file-status')).toBe('✔ Geladen – 2 Türchen gefüllt.');
    expect(query(editor, '.cell.filled')).toHaveLength(2);
    expect(JSON.parse(text(editor, '.file-door'))).toEqual({ text: 'Hallo' });
    expect(query(editor, 'advent-calendar-editor-door')).toHaveLength(0);
  });

  it('meldet eine fehlende Datei', async () => {
    mockFiles();
    const { editor } = await renderEditor(family());
    await openTabWithFiles(editor, 'Türchen');

    expect(text(editor, '.file-status')).toContain('Datei nicht gefunden');
  });

  it('testet das Türchen mit dem Inhalt aus den Dateien', async () => {
    mockFiles({
      [JENS_FILE]: { doors: { 1: { text: 'Für Jens' } } },
      [SHARED_FILE]: { doors: { 1: { text: 'Für alle' } } },
    });
    const { editor, changes } = await renderEditor(family());
    await openTabWithFiles(editor, 'Türchen');

    await click(editor, buttons(editor, 'Türchen 1 testen')[0]);

    const dialog = query<HTMLElement & { open: boolean; content: unknown; sharedContent: unknown }>(
      editor,
      'advent-calendar-dialog',
    )[0];
    expect(dialog.open).toBe(true);
    expect(dialog.content).toEqual({ text: 'Für Jens' });
    expect(dialog.sharedContent).toEqual({ text: 'Für alle' });
    expect(changes).toHaveLength(0);
  });

  it('lädt die Dateien mit „Neu laden“ frisch', async () => {
    const server = mockFiles({ [JENS_FILE]: { doors: {} } });
    const { editor } = await renderEditor(family());
    await openTabWithFiles(editor, 'Türchen');
    expect(text(editor, '.file-status')).toBe('✔ Geladen – 0 Türchen gefüllt.');

    server.files[JENS_FILE] = { doors: { 3: { text: 'Neu' } } };
    await click(editor, buttons(editor, 'Neu laden')[0]);
    await settleEditor(editor);

    expect(server.requests.filter((url) => url === JENS_FILE)).toHaveLength(2);
    expect(text(editor, '.file-status')).toBe('✔ Geladen – 1 Türchen gefüllt.');
  });

  it('macht aus den YAML-Türchen eine Datei und entfernt sie danach', async () => {
    mockFiles({ [JENS_FILE]: { doors: {} } });
    const { editor, changes } = await renderEditor(
      family({ users: { jens: { user_id: 'id-jens', theme: 'kids', doors: { 2: { text: 'Zwei' } } } } }),
    );
    await openTabWithFiles(editor, 'Türchen');
    expect(text(editor, '.box.export')).toContain('In der YAML stehen noch 1 Türchen');

    await click(editor, buttons(editor, 'jens.json herunterladen')[0]);
    expect(downloads.map((d) => d.name)).toEqual(['jens.json']);
    expect(JSON.parse(await downloads[0].text)).toEqual({ doors: { 2: { text: 'Zwei' } } });

    await click(editor, buttons(editor, 'Aus der YAML entfernen')[0]);
    expect(changes).toHaveLength(0);
    await click(editor, buttons(editor, 'Ja, löschen')[0]);
    expect(last(changes).users).toEqual({ jens: { user_id: 'id-jens', theme: 'kids' } });
  });
});

describe('Tab Türchen im YAML-Modus', () => {
  it('bietet den Export an, ohne Dateien zu laden', async () => {
    const server = mockFiles();
    const { editor } = await renderEditor({ users: { jens: { doors: { 1: { text: 'Eins' } } } } });
    await openTabWithFiles(editor, 'Türchen');

    expect(server.requests).toEqual([]);
    expect(query(editor, 'details.export')).toHaveLength(1);
    expect(buttons(editor, 'Aus der YAML entfernen')).toHaveLength(0);
    await click(editor, buttons(editor, 'jens.json herunterladen')[0]);
    expect(JSON.parse(await downloads[0].text)).toEqual({ doors: { 1: { text: 'Eins' } } });
  });
});

describe('Tab Gemeinsam im JSON-Modus', () => {
  it('zeigt die Datei der gemeinsamen Türchen und den Hinweis zum Helfer', async () => {
    mockFiles({ [SHARED_FILE]: { doors: { 6: { mode: 'replace', effect: { action: 'script.advent_nikolaus' } } } } });
    const { editor } = await renderEditor(family(), { hass: mockHass({ isAdmin: true }) });
    await openTabWithFiles(editor, 'Gemeinsam');

    expect(text(editor, '.file-path')).toBe(`📄 ${SHARED_FILE}`);
    expect(text(editor, '.file-status')).toBe('✔ Geladen – 1 Türchen gefüllt.');
    expect(text(editor, '.notice')).toContain('shared.effect_helper');
    expect(query(editor, 'advent-calendar-editor-door')).toHaveLength(0);
  });

  it('sagt, dass es ohne Datei keine gemeinsamen Türchen gibt', async () => {
    mockFiles();
    const { editor } = await renderEditor(family());
    await openTabWithFiles(editor, 'Gemeinsam');

    expect(text(editor, '.file-status')).toBe('Keine Datei – damit gibt es keine gemeinsamen Türchen.');
  });

  it('entfernt gemeinsame YAML-Türchen und behält die Einstellungen', async () => {
    mockFiles();
    const { editor, changes } = await renderEditor(
      family({ shared: { mode: 'off', doors: { 6: { text: 'Nikolaus' } } } }),
    );
    await openTabWithFiles(editor, 'Gemeinsam');

    await click(editor, buttons(editor, 'shared.json herunterladen')[0]);
    expect(JSON.parse(await downloads[0].text)).toEqual({ doors: { 6: { text: 'Nikolaus' } } });

    await click(editor, buttons(editor, 'Aus der YAML entfernen')[0]);
    await click(editor, buttons(editor, 'Ja, löschen')[0]);
    expect(last(changes).shared).toEqual({ mode: 'off' });
  });
});
