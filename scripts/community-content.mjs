// Bausteine für die Community-Edition, genutzt von rollup.config.mjs und den Tests.
import { existsSync, readFileSync } from 'node:fs';

export const CONTENT = 'content/2026.json';
export const SAMPLE = 'content/beispiel.json';

// Nur gegen neugieriges Durchsuchen der JS-Datei (Spoiler), kein Schutz:
// Der Schlüssel steht in der Datei, jeder kann die Inhalte entschlüsseln.
const KEY = 'advent-calendar-card';

/**
 * Welche Datei eingebaut wird: ADVENT_CONTENT, sonst content/2026.json, sonst der Beispielinhalt.
 * Mit ADVENT_REQUIRE_CONTENT=1 (Release) bricht der Build ohne echte Inhalte ab.
 */
export function pickContentFile(env = process.env, exists = existsSync) {
  const strict = env.ADVENT_REQUIRE_CONTENT === '1' || env.ADVENT_REQUIRE_CONTENT === 'true';
  const file = env.ADVENT_CONTENT || (exists(CONTENT) ? CONTENT : SAMPLE);
  if (strict && file === SAMPLE) {
    throw new Error(
      `Echte Inhalte fehlen: Die Karte hätte nur den Beispielinhalt aus ${SAMPLE}. Ein Release damit ist nicht erlaubt – ${CONTENT} anlegen oder ADVENT_CONTENT setzen.`,
    );
  }
  if (strict && !exists(file)) {
    throw new Error(`Echte Inhalte fehlen: ${file} gibt es nicht.`);
  }
  return { file, sample: file === SAMPLE, strict };
}

/** Grobe Prüfung beim Bauen; die vollständige Prüfung macht tests/community-content.test.ts. */
export function checkCalendar(calendar, file) {
  if (!Number.isInteger(calendar?.year)) {
    throw new Error(`${file}: „year“ muss eine Jahreszahl sein.`);
  }
  for (const [day, door] of Object.entries(calendar.doors ?? {})) {
    if (door && 'effect' in door) {
      throw new Error(`${file}: Türchen ${day} hat einen Effekt – in Community-Inhalten nicht erlaubt.`);
    }
  }
}

/** Liest und prüft eine Inhaltsdatei; Windows-Editoren speichern gern mit BOM. */
export function readCalendar(file) {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  let calendar;
  try {
    calendar = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} ist kein gültiges JSON: ${error.message}`);
  }
  checkCalendar(calendar, file);
  return calendar;
}

/** Welche Türchen (1–24) noch keinen Inhalt haben – für einen Hinweis beim Bauen. */
export function missingDoors(calendar) {
  const doors = calendar.doors ?? {};
  return Array.from({ length: 24 }, (_, index) => index + 1).filter((day) => !doors[day]);
}

/** UTF-8 → XOR mit KEY → Base64. */
export function obfuscate(text) {
  const bytes = Buffer.from(text, 'utf8');
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] ^= KEY.charCodeAt(i % KEY.length);
  }
  return bytes.toString('base64');
}

/**
 * Quelltext des Moduls, das src/edition.ts ersetzt. Die Türchen stehen verschleiert
 * darin und werden beim Laden der Karte im Browser einmal entschlüsselt.
 */
export function editionModule(calendar) {
  const doors = obfuscate(JSON.stringify(calendar.doors ?? {}));
  return `const KEY = ${JSON.stringify(KEY)};
function decode(data) {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export const COMMUNITY_CALENDAR = { year: ${JSON.stringify(calendar.year)}, doors: decode(${JSON.stringify(doors)}) };
`;
}
