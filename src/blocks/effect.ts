import type { EffectCall, EffectConfig, HomeAssistant, SharedConfig } from '../types';

/** Was ein Script als Variablen bekommt. */
export interface EffectVariables {
  tag: number;
  person: string;
}

export interface PreparedCall {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  target?: Record<string, string | string[]>;
}

const SERVICE_NAME = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const TARGET_KEYS = ['entity_id', 'device_id', 'area_id', 'floor_id', 'label_id'];
// Script-Dienste, die keine Variablen annehmen.
const SCRIPT_SERVICES_WITHOUT_VARIABLES = ['turn_off', 'toggle', 'reload'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Aktive Aufrufe als Liste. Übersprungen werden mit `enabled: false` abgeschaltete
 * (so schreibt es HAs Aktions-Editor) und noch leere aus dem Editor.
 */
export function normalizeEffects(effect: EffectConfig | undefined): EffectCall[] {
  if (!effect) {
    return [];
  }
  const calls = Array.isArray(effect) ? effect : [effect];
  return calls.filter((call) => call.enabled !== false && (call.action ?? call.service ?? '') !== '');
}

// Felder, die HAs Aktions-Editor zusätzlich schreibt; sie werden akzeptiert und ignoriert.
const EDITOR_KEYS = ['metadata', 'alias', 'enabled', 'continue_on_error'];

function validateCall(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new Error(`„${path}“ muss einen Aufruf enthalten, z. B. „action: script.turn_on“.`);
  }
  const allowed = ['action', 'service', 'data', 'target', ...EDITOR_KEYS];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new Error(
      `„${path}.${unknown}“ gibt es nicht. Effekte können nur Dienste aufrufen (action, data, target) – keine Verzögerungen oder Bedingungen.`,
    );
  }
  if (value.action !== undefined && value.service !== undefined) {
    throw new Error(`„${path}“: bitte nur „action“ oder „service“ angeben, nicht beides.`);
  }
  const key = value.service !== undefined ? 'service' : 'action';
  const name = value[key];
  if (name === undefined) {
    throw new Error(`„${path}“ braucht „action“, z. B. „action: script.advent_lichtshow“.`);
  }
  if (name === '') {
    // Im Editor noch nicht ausgewählt – wird nicht ausgeführt.
    return;
  }
  if (typeof name !== 'string' || !SERVICE_NAME.test(name.trim())) {
    throw new Error(`„${path}.${key}“ muss die Form „domain.dienst“ haben, z. B. script.turn_on.`);
  }
  if (value.data !== undefined && !isRecord(value.data)) {
    throw new Error(`„${path}.data“ muss Einstellungen enthalten, z. B. „brightness_pct: 80“.`);
  }
  if (value.target !== undefined) {
    if (!isRecord(value.target)) {
      throw new Error(`„${path}.target“ muss z. B. „entity_id: light.wohnzimmer“ enthalten.`);
    }
    for (const [targetKey, ids] of Object.entries(value.target)) {
      if (!TARGET_KEYS.includes(targetKey)) {
        throw new Error(
          `„${path}.target.${targetKey}“ gibt es nicht. Möglich sind: ${TARGET_KEYS.join(', ')}.`,
        );
      }
      // Eine leere Liste (im Editor alles abgewählt) ist erlaubt.
      const list = Array.isArray(ids) ? ids : [ids];
      if (list.some((id) => typeof id !== 'string' || id.trim() === '')) {
        throw new Error(`„${path}.target.${targetKey}“ muss eine ID oder eine Liste von IDs sein.`);
      }
    }
  }
}

/** Prüft `effect`: ein Aufruf oder eine Liste von Aufrufen. */
export function validateEffect(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    // Eine leere Liste heißt: noch kein Effekt gewählt.
    value.forEach((call, index) => validateCall(call, `${path}.${index + 1}`));
    return;
  }
  validateCall(value, path);
}

/**
 * Zerlegt den Dienstnamen und gibt Scripts die Variablen `tag` und `person` mit:
 * bei script.turn_on unter data.variables, bei direkten Script-Aufrufen
 * (script.advent_lichtshow) direkt in data. Eigene Angaben aus der YAML haben Vorrang.
 */
export function prepareCall(call: EffectCall, variables: EffectVariables): PreparedCall {
  const name = (call.action ?? call.service ?? '').trim();
  const [domain, service] = name.split('.') as [string, string];
  let data = call.data;
  if (domain === 'script' && service === 'turn_on') {
    const own = isRecord(data?.variables) ? data.variables : {};
    data = { ...data, variables: { ...variables, ...own } };
  } else if (domain === 'script' && !SCRIPT_SERVICES_WITHOUT_VARIABLES.includes(service)) {
    data = { ...variables, ...data };
  }
  return { domain, service, data, target: call.target };
}

function entityIds(call: PreparedCall): string[] {
  const ids = [call.target?.entity_id, call.data?.entity_id].flatMap((value) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  );
  // „all“ und „none“ sind in HA erlaubte Sonderwerte.
  return ids.filter((id) => id !== 'all' && id !== 'none');
}

/** Fehlertext, wenn Dienst oder Ziel-Entität fehlen; HA selbst meldet fehlende Entitäten nur im Log. */
export function findMissing(call: PreparedCall, hass: HomeAssistant): string | undefined {
  const name = `${call.domain}.${call.service}`;
  if (hass.services && !hass.services[call.domain]?.[call.service]) {
    return call.domain === 'script'
      ? `„${name}“ gibt es nicht.`
      : `Dienst „${name}“ gibt es nicht.`;
  }
  if (hass.states) {
    const missing = entityIds(call).find((id) => !(id in hass.states!));
    if (missing) {
      return `„${missing}“ gibt es nicht.`;
    }
  }
  return undefined;
}

/**
 * Hinweis (für Admins in Karte und Editor), wenn gemeinsame Effekte nicht „einmal
 * pro Tag“ laufen können, weil kein Helfer eingetragen ist oder der eingetragene fehlt.
 */
export function sharedEffectNotice(
  shared: SharedConfig | null | undefined,
  states: HomeAssistant['states'],
): string | undefined {
  const hasSharedEffects = Object.values(shared?.doors ?? {}).some(
    (door) => normalizeEffects(door?.effect).length > 0,
  );
  if (!shared || !hasSharedEffects || shared.effect_once === false) {
    return undefined;
  }
  const helper = shared.effect_helper;
  if (!helper) {
    return 'ℹ️ Gemeinsame Effekte laufen bei jeder Person einmal. Für „einmal pro Tag“ einen Text-Helfer anlegen und als shared.effect_helper eintragen.';
  }
  if (states && !states[helper]) {
    return `⚠️ Den Helfer „${helper}“ gibt es nicht – gemeinsame Effekte laufen bei jeder Person.`;
  }
  return undefined;
}

/**
 * Wert, den der Helfer für „gemeinsamer Effekt von Türchen X lief schon“ bekommt,
 * z. B. „2026-12-06“; im Testmodus „test:2026-12-06“, damit Tests den echten Tag nicht blockieren.
 */
export function sharedEffectMarker(year: number, day: number, test: boolean): string {
  return `${test ? 'test:' : ''}${year}-12-${String(day).padStart(2, '0')}`;
}

export async function setHelperValue(
  hass: HomeAssistant,
  helper: string,
  value: string,
): Promise<void> {
  await hass.callService('input_text', 'set_value', { value }, { entity_id: helper }, false);
}

/**
 * Löst einen gemeinsamen Effekt höchstens einmal aus: Steht der Merker schon im
 * Helfer, passiert nichts; sonst wird er zuerst gesetzt und dann ausgelöst.
 * Ohne Helfer läuft der Effekt bei jeder Person (wie effect_once: false).
 * Öffnen zwei Personen im selben Moment, kann er trotzdem doppelt laufen.
 */
export async function runSharedEffects(
  hass: HomeAssistant,
  effect: EffectConfig | undefined,
  variables: EffectVariables,
  once: { helper?: string; marker: string } | undefined,
): Promise<string[]> {
  if (normalizeEffects(effect).length === 0) {
    return [];
  }
  const errors: string[] = [];
  if (once?.helper) {
    const current = hass.states?.[once.helper];
    if (!current) {
      errors.push(`Helfer „${once.helper}“ gibt es nicht.`);
    } else if (current.state === once.marker) {
      return [];
    } else {
      try {
        await setHelperValue(hass, once.helper, once.marker);
      } catch (err) {
        const message = isRecord(err) && typeof err.message === 'string' ? err.message : String(err);
        errors.push(`Helfer „${once.helper}“: ${message}`);
      }
    }
  }
  return [...errors, ...(await runEffects(hass, effect, variables))];
}

/**
 * Löst alle Effekte gleichzeitig aus (direkt aufgerufene Scripts laufen sonst
 * nacheinander, weil HA erst nach ihrem Ende antwortet). Liefert Fehlermeldungen.
 */
export async function runEffects(
  hass: HomeAssistant,
  effect: EffectConfig | undefined,
  variables: EffectVariables,
): Promise<string[]> {
  const results = await Promise.all(
    normalizeEffects(effect).map(async (call) => {
      const prepared = prepareCall(call, variables);
      const missing = findMissing(prepared, hass);
      if (missing) {
        return missing;
      }
      try {
        await hass.callService(
          prepared.domain,
          prepared.service,
          prepared.data,
          prepared.target,
          false,
        );
        return undefined;
      } catch (err) {
        const message = isRecord(err) && typeof err.message === 'string' ? err.message : String(err);
        return `${prepared.domain}.${prepared.service}: ${message}`;
      }
    }),
  );
  return results.filter((error): error is string => error !== undefined);
}
