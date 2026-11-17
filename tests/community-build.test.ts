import { describe, expect, it } from 'vitest';
// @ts-expect-error – reines JavaScript ohne Typen, läuft beim Bauen mit Rollup.
import * as build from '../scripts/community-content.mjs';

const { CONTENT, SAMPLE, editionModule, missingDoors, obfuscate, pickContentFile } = build as {
  CONTENT: string;
  SAMPLE: string;
  editionModule(calendar: unknown): string;
  missingDoors(calendar: unknown): number[];
  obfuscate(text: string): string;
  pickContentFile(
    env: Record<string, string | undefined>,
    exists: (file: string) => boolean,
  ): { file: string; sample: boolean; strict: boolean };
};

const CALENDAR = {
  year: 2026,
  doors: {
    1: { text: 'Geheimer Tipp für Türchen 1 🎄', video: 'https://www.youtube.com/watch?v=abcdefghijk' },
    24: { text: 'Frohe Weihnachten!' },
  },
};

/** Führt das erzeugte Modul aus wie der Browser und liefert COMMUNITY_CALENDAR. */
function load(source: string): unknown {
  const body = source.replace('export const COMMUNITY_CALENDAR =', 'return');
  expect(body).not.toBe(source);
  return new Function(body)();
}

describe('Bauen der Community-Edition', () => {
  it('verschleiert die Türchen, liefert im Browser aber dieselben Inhalte', () => {
    const source = editionModule(CALENDAR);

    expect(source).not.toContain('Geheimer Tipp');
    expect(source).not.toContain('abcdefghijk');
    expect(source).not.toContain('Weihnachten');
    expect(load(source)).toEqual(JSON.parse(JSON.stringify(CALENDAR)));
  });

  it('verschleiert auch Umlaute und Emoji verlustfrei', () => {
    expect(obfuscate('äöü 🎅')).not.toContain('äöü');
    expect(obfuscate('')).toBe('');
  });

  it('nimmt die echten Inhalte, sonst den Beispielinhalt', () => {
    expect(pickContentFile({}, () => true)).toEqual({ file: CONTENT, sample: false, strict: false });
    expect(pickContentFile({}, () => false)).toEqual({ file: SAMPLE, sample: true, strict: false });
    expect(pickContentFile({ ADVENT_CONTENT: 'x.json' }, () => false).file).toBe('x.json');
  });

  it('bricht im Release ohne echte Inhalte ab', () => {
    expect(() => pickContentFile({ ADVENT_REQUIRE_CONTENT: '1' }, () => false)).toThrow(
      'Echte Inhalte fehlen',
    );
    expect(() =>
      pickContentFile({ ADVENT_REQUIRE_CONTENT: '1', ADVENT_CONTENT: SAMPLE }, () => true),
    ).toThrow('Ein Release damit ist nicht erlaubt');
    expect(() =>
      pickContentFile({ ADVENT_REQUIRE_CONTENT: 'true', ADVENT_CONTENT: 'fehlt.json' }, () => false),
    ).toThrow('fehlt.json gibt es nicht');
    expect(pickContentFile({ ADVENT_REQUIRE_CONTENT: '1' }, () => true)).toEqual({
      file: CONTENT,
      sample: false,
      strict: true,
    });
  });

  it('nennt die noch leeren Türchen', () => {
    expect(missingDoors(CALENDAR)).toHaveLength(22);
    expect(missingDoors(CALENDAR)).not.toContain(1);
  });
});
