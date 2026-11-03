import { afterEach, describe, expect, it, vi } from 'vitest';
import jensExample from '../examples/jens.json';
import {
  contentFile,
  isComplete,
  jsonPathError,
  loadCalendarContent,
  loadContentFile,
  parseContentFile,
  serverPath,
  toContentJson,
  validateContentConfig,
  withFileDoors,
  type CalendarContent,
} from '../src/content-source';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockFiles } from './mock-files';

afterEach(() => {
  vi.unstubAllGlobals();
});

const TYPE = 'custom:advent-calendar-card';
const config = (extra: Omit<AdventCalendarCardConfig, 'type'> = {}): AdventCalendarCardConfig => ({
  type: TYPE,
  ...extra,
});

const JENS = { path: '/local/advent/jens.json', url: '/local/advent/jens.json' };

describe('Dateipfad', () => {
  it('nutzt standardmäßig /local/advent/{person}.json', () => {
    expect(contentFile(config(), 'jens', 2026)).toEqual(JENS);
  });

  it('setzt {person} und {year} in einen eigenen Pfad ein', () => {
    const file = contentFile(config({ json_path: '/local/advent/{year}/{person}.json' }), 'anna', 2026);
    expect(file.path).toBe('/local/advent/2026/anna.json');
  });

  it('kodiert Namen in der URL, zeigt sie aber lesbar an', () => {
    expect(contentFile(config(), 'Anna Lena', 2026)).toEqual({
      path: '/local/advent/Anna Lena.json',
      url: '/local/advent/Anna%20Lena.json',
    });
  });

  it('nennt den Ordner auf dem Server für /local/', () => {
    expect(serverPath('/local/advent/jens.json')).toBe('/config/www/advent/jens.json');
    expect(serverPath('/hacsfiles/advent/jens.json')).toBeUndefined();
  });
});

describe('Config prüfen', () => {
  it('akzeptiert yaml und json als Inhaltsquelle', () => {
    expect(() => validateContentConfig(config({ content_source: 'yaml' }))).not.toThrow();
    expect(() => validateContentConfig(config({ content_source: 'json' }))).not.toThrow();
    expect(() =>
      validateContentConfig(config({ content_source: 'xml' as 'json' })),
    ).toThrow('„content_source“ muss eines davon sein: yaml, json.');
  });

  it.each([
    ['advent/{person}.json'],
    ['//example.com/{person}.json'],
    ['/local/advent/jens.json'],
    [42],
  ])('lehnt json_path %s ab', (path) => {
    expect(jsonPathError(path)).toContain('{person}');
    expect(() => validateContentConfig(config({ json_path: path as string }))).toThrow('json_path');
  });

  it('reserviert fallback und shared nur im JSON-Modus', () => {
    const users = { shared: {}, anna: {} };
    expect(() => validateContentConfig(config({ users }))).not.toThrow();
    expect(() => validateContentConfig(config({ users, content_source: 'json' }))).toThrow(
      '„users.shared“',
    );
    expect(() =>
      validateContentConfig(config({ users: { Fallback: {} }, content_source: 'json' })),
    ).toThrow('reserviert');
  });
});

describe('Datei-Inhalt prüfen', () => {
  it('liefert die Türchen, auch ohne doors', () => {
    expect(parseContentFile({ doors: { 1: { text: 'Hallo' } } }, false)).toEqual({ 1: { text: 'Hallo' } });
    expect(parseContentFile({}, false)).toEqual({});
  });

  it('verlangt ein Objekt', () => {
    expect(() => parseContentFile([], false)).toThrow('Objekt');
    expect(() => parseContentFile('Hallo', false)).toThrow('Objekt');
  });

  it('kennt nur doors', () => {
    expect(() => parseContentFile({ theme: 'kids', doors: {} }, false)).toThrow(
      '„theme“ gibt es in der Datei nicht, erlaubt ist nur „doors“.',
    );
  });

  it('prüft die Türchen wie in der YAML', () => {
    expect(() => parseContentFile({ doors: { 25: { text: 'Zu spät' } } }, false)).toThrow('„doors“: „25“');
    expect(() => parseContentFile({ doors: { 3: { foo: 'bar' } } }, false)).toThrow('doors.3');
  });

  it('erlaubt mode nur bei gemeinsamen Türchen', () => {
    const data = { doors: { 6: { mode: 'replace', text: 'Nikolaus' } } };
    expect(parseContentFile(data, true)).toEqual(data.doors);
    expect(() => parseContentFile(data, false)).toThrow('doors.6');
  });
});

describe('Datei laden', () => {
  it('lädt frisch vom Server', async () => {
    const server = mockFiles({ '/local/advent/jens.json': { doors: { 1: { text: 'Hallo' } } } });

    const result = await loadContentFile(JENS, false);

    expect(result).toEqual({ path: JENS.path, status: 'ok', doors: { 1: { text: 'Hallo' } } });
    expect(server.inits[0]).toMatchObject({ cache: 'no-cache' });
  });

  it('meldet eine fehlende Datei', async () => {
    mockFiles();
    expect(await loadContentFile(JENS, false)).toEqual({ path: JENS.path, status: 'missing' });
  });

  it.each([
    [{ status: 500 }, '„/local/advent/jens.json“ konnte nicht geladen werden (HTTP 500).'],
    [new TypeError('Failed to fetch'), '„/local/advent/jens.json“ konnte nicht geladen werden.'],
    [{ raw: '{ "doors": { 1: } }' }, '„/local/advent/jens.json“ ist kein gültiges JSON'],
    [{ doors: { 1: { foo: 1 } } }, 'Fehler in „/local/advent/jens.json“: „doors.1.foo“ gibt es nicht.'],
  ])('meldet Fehler verständlich (%#)', async (file, message) => {
    mockFiles({ '/local/advent/jens.json': file });
    const result = await loadContentFile(JENS, false);
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toContain(message);
  });

  it('lädt Person und gemeinsame Türchen zusammen', async () => {
    const server = mockFiles({
      '/local/advent/2026/jens.json': { doors: { 1: { text: 'Jens' } } },
    });
    const content = await loadCalendarContent(
      config({ json_path: '/local/advent/{year}/{person}.json' }),
      'jens',
      2026,
    );
    expect(server.requests).toEqual(['/local/advent/2026/jens.json', '/local/advent/2026/shared.json']);
    expect(content.personal.status).toBe('ok');
    expect(content.shared.status).toBe('missing');
  });

  it('lädt für den Fallback fallback.json', async () => {
    const server = mockFiles();
    await loadCalendarContent(config(), undefined, 2026);
    expect(server.requests[0]).toBe('/local/advent/fallback.json');
  });
});

describe('Vollständig?', () => {
  const ok = { path: '', status: 'ok' as const, doors: {} };
  const missing = { path: '', status: 'missing' as const };
  const error = { path: '', status: 'error' as const, message: 'kaputt' };

  it('braucht die Datei der Person, die gemeinsame ist freiwillig', () => {
    expect(isComplete({ personal: ok, shared: ok })).toBe(true);
    expect(isComplete({ personal: ok, shared: missing })).toBe(true);
    expect(isComplete({ personal: missing, shared: ok })).toBe(false);
    expect(isComplete({ personal: ok, shared: error })).toBe(false);
  });
});

describe('Türchen aus Dateien einsetzen', () => {
  const content: CalendarContent = {
    personal: { path: '', status: 'ok', doors: { 1: { text: 'Aus der Datei' } } },
    shared: { path: '', status: 'ok', doors: { 6: { mode: 'replace', text: 'Für alle' } } },
  };

  it('lässt im YAML-Modus alles, wie es ist', () => {
    const yaml = config({ shared: { doors: { 6: { text: 'YAML' } } } });
    const calendar = { doors: { 1: { text: 'YAML' } } };
    const result = withFileDoors(yaml, calendar, content);
    expect(result.config).toBe(yaml);
    expect(result.calendar).toBe(calendar);
  });

  it('ignoriert im JSON-Modus die YAML-Türchen und behält die Einstellungen', () => {
    const json = config({
      content_source: 'json',
      shared: { mode: 'off', effect_helper: 'input_text.advent', doors: { 2: { text: 'YAML' } } },
    });
    const result = withFileDoors(json, { theme: 'kids', doors: { 1: { text: 'YAML' } } }, content);
    expect(result.calendar).toEqual({ theme: 'kids', doors: { 1: { text: 'Aus der Datei' } } });
    expect(result.config.shared).toEqual({
      mode: 'off',
      effect_helper: 'input_text.advent',
      doors: { 6: { mode: 'replace', text: 'Für alle' } },
    });
  });

  it('hat ohne geladene Dateien keine Türchen', () => {
    const result = withFileDoors(config({ content_source: 'json' }), { doors: { 1: { text: 'YAML' } } }, undefined);
    expect(result.calendar.doors).toBeUndefined();
    expect(result.config.shared?.doors).toBeUndefined();
  });
});

describe('Beispiel', () => {
  it('examples/jens.json ist eine gültige Datei', () => {
    expect(Object.keys(parseContentFile(jensExample, false))).toEqual(['1', '2', '3', '4', '5', '7']);
  });
});

describe('Export als Datei', () => {
  it('sortiert, lässt leere Türchen weg und ist wieder einlesbar', () => {
    const text = toContentJson({ 12: { text: 'Zwölf' }, 3: null, 2: { task: 'Zwei' } });
    expect(Object.keys(JSON.parse(text).doors)).toEqual(['2', '12']);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseContentFile(JSON.parse(text), false)).toEqual({ 2: { task: 'Zwei' }, 12: { text: 'Zwölf' } });
  });
});
