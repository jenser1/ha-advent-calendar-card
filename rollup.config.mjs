import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

// Im Watch-Modus (npm run watch) nicht minifizieren, damit man im Browser debuggen kann.
const dev = process.env.ROLLUP_WATCH === 'true';

// community (Standard, Release 2026) oder full (npm run build:full).
const edition = process.env.EDITION ?? 'community';
const CONTENT = 'content/2026.json';
const SAMPLE = 'content/beispiel.json';

/** Grobe Prüfung beim Bauen; die vollständige Prüfung macht tests/community-content.test.ts. */
function checkCalendar(calendar, file) {
  if (!Number.isInteger(calendar?.year)) {
    throw new Error(`${file}: „year“ muss eine Jahreszahl sein.`);
  }
  for (const [day, door] of Object.entries(calendar.doors ?? {})) {
    if (door && 'effect' in door) {
      throw new Error(`${file}: Türchen ${day} hat einen Effekt – in Community-Inhalten nicht erlaubt.`);
    }
  }
}

/** Ersetzt src/edition.ts beim Bauen der Community-Edition durch die eingebauten Inhalte. */
function communityEdition() {
  const target = resolve('src/edition.ts');
  const id = '\0advent-community-edition';
  return {
    name: 'advent-community-edition',
    async resolveId(source, importer, options) {
      if (!importer || !source.endsWith('edition')) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && resolve(resolved.id) === target ? id : null;
    },
    load(loadId) {
      if (loadId !== id) {
        return null;
      }
      const file = process.env.ADVENT_CONTENT ?? (existsSync(CONTENT) ? CONTENT : SAMPLE);
      if (file === SAMPLE) {
        this.warn(`${CONTENT} fehlt – die Karte enthält nur den Beispielinhalt aus ${SAMPLE}.`);
      }
      this.addWatchFile(resolve(file));
      // Windows-Editoren speichern gern mit BOM – das ist kein Fehler im Inhalt.
      const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
      let calendar;
      try {
        calendar = JSON.parse(text);
      } catch (error) {
        throw new Error(`${file} ist kein gültiges JSON: ${error.message}`);
      }
      checkCalendar(calendar, file);
      return `export const COMMUNITY_CALENDAR = ${JSON.stringify(calendar)};`;
    },
  };
}

export default {
  input: 'src/advent-calendar-card.ts',
  output: {
    file: 'dist/advent-calendar-card.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins: [
    edition === 'community' && communityEdition(),
    nodeResolve(),
    json({ preferConst: true }),
    typescript({ include: ['src/**/*.ts'], noEmitOnError: !dev }),
    !dev && terser({ format: { comments: false } }),
  ],
};
