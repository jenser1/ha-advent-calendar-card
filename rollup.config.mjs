import { resolve } from 'node:path';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import {
  CONTENT,
  SAMPLE,
  editionModule,
  missingDoors,
  pickContentFile,
  readCalendar,
} from './scripts/community-content.mjs';

// Im Watch-Modus (npm run watch) nicht minifizieren, damit man im Browser debuggen kann.
const dev = process.env.ROLLUP_WATCH === 'true';

// community (Standard, Release 2026) oder full (npm run build:full).
const edition = process.env.EDITION ?? 'community';

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
      const { file, sample, strict } = pickContentFile();
      if (sample) {
        this.warn(`${CONTENT} fehlt – die Karte enthält nur den Beispielinhalt aus ${SAMPLE}.`);
      }
      this.addWatchFile(resolve(file));
      const calendar = readCalendar(file);
      const missing = missingDoors(calendar);
      if (strict && missing.length > 0) {
        this.warn(`Noch leer (zeigen den Text für leere Türchen): ${missing.join(', ')}.`);
      }
      return editionModule(calendar);
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
