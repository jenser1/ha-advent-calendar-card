import type {
  AdventCalendarCardConfig,
  EffectCall,
  HomeAssistant,
  LightEffectConfig,
  MusicEffectConfig,
} from '../types';
import { runEffects, type EffectVariables } from './effect';

/**
 * Einfache Effekte für den Editor: Licht (effect_light) und Musik (effect_music).
 * Die Karte baut daraus selbst die Dienstaufrufe – ganz ohne YAML oder Script.
 */

export const LIGHT_MODES = ['flash', 'effect'] as const;
export const MUSIC_PLAYERS = ['music_assistant', 'media_player'] as const;
/** Grenzen für effect_light.duration in Sekunden. */
export const MIN_DURATION = 1;
export const MAX_DURATION = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(value: Record<string, unknown>, path: string, allowed: string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new Error(`„${path}.${unknown}“ gibt es nicht. Möglich sind: ${allowed.join(', ')}.`);
  }
}

function checkEntity(value: unknown, path: string, domain: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || !value.startsWith(`${domain}.`)) {
    throw new Error(`„${path}.entity_id“ muss eine ${domain}-Entität sein, z. B. „${domain}.wohnzimmer“.`);
  }
}

function checkText(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`„${path}“ muss ein Text sein.`);
  }
}

/** Prüft effect_light und effect_music mit verständlichen Fehlermeldungen. */
export function validateSimpleEffects(config: AdventCalendarCardConfig): void {
  const light: unknown = config.effect_light;
  if (light != null) {
    if (!isRecord(light)) {
      throw new Error('„effect_light“ braucht z. B. „entity_id: light.wohnzimmer“.');
    }
    checkKeys(light, 'effect_light', ['entity_id', 'mode', 'effect', 'duration']);
    checkEntity(light.entity_id, 'effect_light', 'light');
    if (light.mode !== undefined && !LIGHT_MODES.includes(light.mode as never)) {
      throw new Error('„effect_light.mode“ muss „flash“ oder „effect“ sein.');
    }
    checkText(light.effect, 'effect_light.effect');
    const duration = light.duration;
    if (
      duration !== undefined &&
      (typeof duration !== 'number' || duration < MIN_DURATION || duration > MAX_DURATION)
    ) {
      throw new Error(
        `„effect_light.duration“ muss eine Zahl von ${MIN_DURATION} bis ${MAX_DURATION} sein (Sekunden).`,
      );
    }
  }

  const music: unknown = config.effect_music;
  if (music != null) {
    if (!isRecord(music)) {
      throw new Error('„effect_music“ braucht z. B. „entity_id: media_player.wohnzimmer“ und „media_id“.');
    }
    checkKeys(music, 'effect_music', ['entity_id', 'player', 'media_id', 'media_type', 'volume', 'days', 'controls']);
    if (music.controls !== undefined && typeof music.controls !== 'boolean') {
      throw new Error('„effect_music.controls“ muss true oder false sein.');
    }
    checkEntity(music.entity_id, 'effect_music', 'media_player');
    if (music.player !== undefined && !MUSIC_PLAYERS.includes(music.player as never)) {
      throw new Error('„effect_music.player“ muss „music_assistant“ oder „media_player“ sein.');
    }
    checkText(music.media_id, 'effect_music.media_id');
    checkText(music.media_type, 'effect_music.media_type');
    const volume = music.volume;
    if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 100)) {
      throw new Error('„effect_music.volume“ muss eine Zahl von 0 bis 100 sein (Prozent).');
    }
    const days = music.days;
    if (
      days !== undefined &&
      (!Array.isArray(days) || days.some((day) => !Number.isInteger(day) || day < 1 || day > 24))
    ) {
      throw new Error('„effect_music.days“ muss eine Liste von Türchen sein, z. B. [6, 24].');
    }
  }
}

/** Aufruf für das Licht oder undefined, wenn keine Lampe gewählt ist. */
export function lightCall(light: LightEffectConfig | undefined): EffectCall | undefined {
  if (!light?.entity_id) {
    return undefined;
  }
  // Ohne Effektnamen bleibt es beim Blinken.
  const data =
    light.mode === 'effect' && light.effect?.trim() ? { effect: light.effect.trim() } : { flash: 'short' };
  return { action: 'light.turn_on', target: { entity_id: light.entity_id }, data };
}

/** Aufrufe für die Musik in der richtigen Reihenfolge (erst Lautstärke, dann abspielen). */
export function musicCalls(music: MusicEffectConfig | undefined, day: number): EffectCall[] {
  const media = music?.media_id?.trim();
  if (!music?.entity_id || !media) {
    return [];
  }
  if (music.days && music.days.length > 0 && !music.days.includes(day)) {
    return [];
  }
  const target = { entity_id: music.entity_id };
  const calls: EffectCall[] = [];
  if (typeof music.volume === 'number') {
    calls.push({
      action: 'media_player.volume_set',
      target,
      data: { volume_level: Math.round(music.volume) / 100 },
    });
  }
  calls.push(
    music.player === 'music_assistant'
      ? { action: 'music_assistant.play_media', target, data: { media_id: media, enqueue: 'replace' } }
      : {
          action: 'media_player.play_media',
          target,
          data: { media_content_id: media, media_content_type: music.media_type?.trim() || 'music' },
        },
  );
  return calls;
}

/** Nach so vielen Millisekunden geht eine vorher ausgeschaltete Lampe nach dem Blinken wieder aus. */
export const FLASH_RESTORE_MS = 3000;
/** So lange zählt ein Stopp der Musik noch als Anlaufen (Wechsel des Titels, Puffern). */
export const MUSIC_START_GRACE_MS = 10_000;
/** Spielt die Musik bis dahin nicht, wird die Lautstärke trotzdem zurückgestellt. */
export const MUSIC_START_TIMEOUT_MS = 60_000;
/**
 * Rundungsspielraum beim Vergleich von Lautstärken. Passt die Lautstärke am Ende weder zur alten
 * noch zur gesetzten oder gemeldeten, gilt sie als „selbst geändert“ und bleibt, wie sie ist.
 */
export const VOLUME_TOLERANCE = 0.011;
/**
 * So lange nach dem Start zählt der zuletzt gemeldete Wert als „von der Karte gesetzt“.
 * Player melden kurz nach dem Start teils Zwischenwerte (z. B. 25 % → 8 % → 27 %).
 */
export const VOLUME_SETTLE_MS = 10_000;

/** So lange bleibt eine Lampe ohne eigene Blink-Funktion beim nachgebauten Blinken an bzw. aus. */
export const BLINK_MS = 1000;
/** LightEntityFeature.FLASH in HA. */
const FEATURE_FLASH = 8;

/** Kann die Lampe nicht selbst blinken? (Nur, wenn HA das sicher meldet.) */
function lacksFlash(hass: HomeAssistant, entityId: string): boolean {
  const state = hass.states?.[entityId];
  const features = state?.attributes?.supported_features;
  return (
    (state?.state === 'on' || state?.state === 'off') &&
    typeof features === 'number' &&
    (features & FEATURE_FLASH) === 0
  );
}

const COLOR_ATTRIBUTES: Record<string, string> = {
  color_temp: 'color_temp_kelvin',
  hs: 'hs_color',
  rgb: 'rgb_color',
  rgbw: 'rgbw_color',
  rgbww: 'rgbww_color',
  xy: 'xy_color',
};

/**
 * Daten für light.turn_on, die Helligkeit, Farbe bzw. laufenden Effekt wiederherstellen.
 * `ignoreEffect`: Effekt, den die Karte selbst gestartet hat. Manche Lampen (z. B. Govee)
 * melden einen Effekt weiter, obwohl er längst aus ist – dann zählt die Farbe.
 */
export function restoreLightData(
  attributes: Record<string, unknown> | undefined,
  ignoreEffect?: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!attributes) {
    return data;
  }
  if (typeof attributes.brightness === 'number') {
    data.brightness = attributes.brightness;
  }
  const effect = attributes.effect;
  const effects = attributes.effect_list;
  if (
    typeof effect === 'string' &&
    effect !== 'none' &&
    effect.toLowerCase() !== ignoreEffect?.trim().toLowerCase() &&
    Array.isArray(effects) &&
    effects.includes(effect)
  ) {
    data.effect = effect;
    return data;
  }
  const colorKey = COLOR_ATTRIBUTES[String(attributes.color_mode)];
  if (colorKey && attributes[colorKey] != null) {
    data[colorKey] = attributes[colorKey];
  }
  return data;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Blinken für Lampen ohne eigene Blink-Funktion (z. B. viele Govee): einmal kurz
 * umschalten und zurück. War sie an, kommen Helligkeit, Farbe bzw. Effekt wieder.
 */
async function blinkByHand(
  hass: HomeAssistant,
  entityId: string,
  variables: EffectVariables,
): Promise<string[]> {
  const target = { entity_id: entityId };
  const state = hass.states?.[entityId];
  if (state?.state === 'off') {
    const errors = await runEffects(hass, { action: 'light.turn_on', target, data: {} }, variables);
    if (errors.length === 0) {
      await sleep(BLINK_MS);
      errors.push(...(await runEffects(hass, { action: 'light.turn_off', target, data: {} }, variables)));
    }
    return errors;
  }
  const restore = restoreLightData(state?.attributes);
  const errors = await runEffects(hass, { action: 'light.turn_off', target, data: {} }, variables);
  if (errors.length === 0) {
    await sleep(BLINK_MS);
    errors.push(...(await runEffects(hass, { action: 'light.turn_on', target, data: restore }, variables)));
  }
  return errors;
}

async function runLight(
  hass: HomeAssistant,
  light: LightEffectConfig | undefined,
  variables: EffectVariables,
): Promise<string[]> {
  const call = lightCall(light);
  if (!call || !light?.entity_id) {
    return [];
  }
  const entityId = light.entity_id;
  const flash = call.data?.flash !== undefined;
  if (flash && lacksFlash(hass, entityId)) {
    return blinkByHand(hass, entityId, variables);
  }
  const before = hass.states?.[entityId];
  const duration = light.duration;
  const errors = await runEffects(hass, call, variables);
  if (!flash && typeof duration === 'number' && errors.length === 0) {
    // Lichteffekt mit Dauer: danach wie vorher – aus bzw. mit alter Helligkeit, Farbe oder altem Effekt.
    if (before?.state === 'off' || before?.state === 'on') {
      const back: EffectCall =
        before.state === 'off'
          ? { action: 'light.turn_off', target: { entity_id: entityId }, data: {} }
          : {
              action: 'light.turn_on',
              target: { entity_id: entityId },
              data: restoreLightData(before.attributes, light.effect),
            };
      setTimeout(() => {
        void runEffects(hass, back, variables).then((failed) => {
          if (failed.length > 0) {
            console.warn('[advent-calendar-card] Lampe nicht zurückgestellt:', failed);
          }
        });
      }, duration * 1000);
    }
    return errors;
  }
  const restore = flash && before?.state === 'off';
  if (restore && errors.length === 0) {
    setTimeout(() => {
      hass.callService('light', 'turn_off', {}, { entity_id: entityId }, false).catch((err) =>
        console.warn('[advent-calendar-card] Lampe nicht wieder ausgeschaltet:', err),
      );
    }, FLASH_RESTORE_MS);
  }
  return errors;
}

interface PendingVolume {
  /** Lautstärke vor dem Türchen (0–1). */
  previous: number;
  /** Von der Karte gesetzte Lautstärke (0–1). */
  set: number;
  /**
   * Was der Player nach dem Setzen meldet. Das kann vom gesetzten Wert abweichen und muss
   * nicht stimmen, zählt aber nicht als Änderung von Hand.
   */
  reported?: number;
  since: number;
  playing: boolean;
}

/** Player, deren Lautstärke nach der Musik zurückgestellt wird. */
const pendingVolumes = new Map<string, PendingVolume>();

/** Nur für Tests. */
export function clearPendingVolumes(): void {
  pendingVolumes.clear();
}

function volumeOf(hass: HomeAssistant, entityId: string): number | undefined {
  const level = hass.states?.[entityId]?.attributes?.volume_level;
  return typeof level === 'number' ? level : undefined;
}

/**
 * Stellt die Lautstärke zurück, sobald die Musik des Türchens zu Ende ist. Wird bei jedem
 * hass-Update der Karte aufgerufen – also nur, solange ein Dashboard mit der Karte offen ist.
 * Hat jemand die Lautstärke inzwischen selbst geändert, bleibt sie so.
 */
export function restoreVolumes(hass: HomeAssistant | undefined, now = Date.now()): void {
  if (!hass?.states || pendingVolumes.size === 0) {
    return;
  }
  for (const [entityId, pending] of pendingVolumes) {
    const current = volumeOf(hass, entityId);
    const settling = pending.reported === undefined || now - pending.since < VOLUME_SETTLE_MS;
    if (settling && current !== undefined && Math.abs(current - pending.previous) > VOLUME_TOLERANCE) {
      pending.reported = current;
    }
    const state = hass.states[entityId]?.state;
    if (state === 'playing' || state === 'buffering') {
      pending.playing = pending.playing || state === 'playing';
      continue;
    }
    const age = now - pending.since;
    const finished = pending.playing ? age >= MUSIC_START_GRACE_MS : age >= MUSIC_START_TIMEOUT_MS;
    if (!finished) {
      continue;
    }
    pendingVolumes.delete(entityId);
    // Meldet der Player wieder die alte Lautstärke, kann das Gerät trotzdem noch auf der gesetzten
    // stehen (Music Assistant meldet zeitweise einen veralteten Wert). Darum auch dann zurückstellen;
    // nur ein Wert, der zu nichts davon passt, stammt von Hand.
    const known = [pending.previous, pending.set, pending.reported];
    const matches = (value?: number) => value !== undefined && Math.abs(current! - value) <= VOLUME_TOLERANCE;
    if (current !== undefined && !known.some(matches)) {
      continue;
    }
    hass
      .callService('media_player', 'volume_set', { volume_level: pending.previous }, { entity_id: entityId }, false)
      .catch((err) => console.warn('[advent-calendar-card] Lautstärke nicht zurückgestellt:', err));
  }
}

async function runMusic(
  hass: HomeAssistant,
  music: MusicEffectConfig | undefined,
  variables: EffectVariables,
): Promise<string[]> {
  const calls = musicCalls(music, variables.tag);
  const entityId = music?.entity_id;
  const volumeCall = calls.find((call) => call.action === 'media_player.volume_set');
  const previous = entityId ? volumeOf(hass, entityId) : undefined;
  const errors: string[] = [];
  for (const call of calls) {
    errors.push(...(await runEffects(hass, call, variables)));
  }
  const set = volumeCall?.data?.volume_level;
  if (entityId && previous !== undefined && typeof set === 'number' && errors.length === 0) {
    // Läuft schon eine Rückstellung, bleibt die ursprüngliche Lautstärke maßgeblich.
    const earlier = pendingVolumes.get(entityId)?.previous;
    if (Math.abs((earlier ?? previous) - set) > 0.001) {
      pendingVolumes.set(entityId, { previous: earlier ?? previous, set, since: Date.now(), playing: false });
    }
  }
  return errors;
}

/** Löst Licht und Musik gleichzeitig aus; die Musik-Schritte laufen nacheinander. Liefert Fehler. */
export async function runSimpleEffects(
  hass: HomeAssistant,
  config: AdventCalendarCardConfig,
  variables: EffectVariables,
): Promise<string[]> {
  const results = await Promise.all([
    runLight(hass, config.effect_light, variables),
    runMusic(hass, config.effect_music, variables),
  ]);
  return results.flat();
}

/** Was die Musik-Tasten im geöffneten Türchen anzeigen. */
export interface MusicControl {
  entityId: string;
  /** Zustand des Players, z. B. playing, paused, idle. */
  state: string;
  /** Was gerade läuft (media_title), falls bekannt. */
  title?: string;
  /** Name des Players. */
  name: string;
}

export type MusicAction = 'pause' | 'play' | 'stop' | 'replay';

/**
 * Musik-Tasten für dieses Türchen – nur, wenn an diesem Türchen Musik eingestellt ist,
 * der Player existiert und die Tasten nicht abgeschaltet sind (controls: false).
 */
export function musicControlFor(
  hass: HomeAssistant | undefined,
  music: MusicEffectConfig | undefined,
  day: number,
): MusicControl | undefined {
  if (!music?.entity_id || music.controls === false || musicCalls(music, day).length === 0) {
    return undefined;
  }
  const stateObj = hass?.states?.[music.entity_id];
  if (!stateObj) {
    return undefined;
  }
  const title = stateObj.attributes?.media_title;
  const name = stateObj.attributes?.friendly_name;
  return {
    entityId: music.entity_id,
    state: stateObj.state,
    title: typeof title === 'string' && title ? title : undefined,
    name: typeof name === 'string' && name ? name : music.entity_id,
  };
}

const MUSIC_SERVICES: Record<Exclude<MusicAction, 'replay'>, string> = {
  pause: 'media_pause',
  play: 'media_play',
  stop: 'media_stop',
};

/** Führt eine Musik-Taste aus. „replay“ spielt die Musik des Türchens noch einmal ab. Liefert Fehler. */
export async function controlMusic(
  hass: HomeAssistant,
  music: MusicEffectConfig | undefined,
  action: MusicAction,
  variables: EffectVariables,
): Promise<string[]> {
  if (!music?.entity_id) {
    return [];
  }
  if (action === 'replay') {
    return runMusic(hass, music, variables);
  }
  return runEffects(
    hass,
    { action: `media_player.${MUSIC_SERVICES[action]}`, target: { entity_id: music.entity_id } },
    variables,
  );
}
