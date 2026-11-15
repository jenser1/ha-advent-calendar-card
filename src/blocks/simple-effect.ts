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
    checkKeys(light, 'effect_light', ['entity_id', 'mode', 'effect']);
    checkEntity(light.entity_id, 'effect_light', 'light');
    if (light.mode !== undefined && !LIGHT_MODES.includes(light.mode as never)) {
      throw new Error('„effect_light.mode“ muss „flash“ oder „effect“ sein.');
    }
    checkText(light.effect, 'effect_light.effect');
  }

  const music: unknown = config.effect_music;
  if (music != null) {
    if (!isRecord(music)) {
      throw new Error('„effect_music“ braucht z. B. „entity_id: media_player.wohnzimmer“ und „media_id“.');
    }
    checkKeys(music, 'effect_music', ['entity_id', 'player', 'media_id', 'volume', 'days']);
    checkEntity(music.entity_id, 'effect_music', 'media_player');
    if (music.player !== undefined && !MUSIC_PLAYERS.includes(music.player as never)) {
      throw new Error('„effect_music.player“ muss „music_assistant“ oder „media_player“ sein.');
    }
    checkText(music.media_id, 'effect_music.media_id');
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
          data: { media_content_id: media, media_content_type: 'music' },
        },
  );
  return calls;
}

/** Löst Licht und Musik gleichzeitig aus; die Musik-Schritte laufen nacheinander. Liefert Fehler. */
export async function runSimpleEffects(
  hass: HomeAssistant,
  config: AdventCalendarCardConfig,
  variables: EffectVariables,
): Promise<string[]> {
  const light = lightCall(config.effect_light);
  const music = async (): Promise<string[]> => {
    const errors: string[] = [];
    for (const call of musicCalls(config.effect_music, variables.tag)) {
      errors.push(...(await runEffects(hass, call, variables)));
    }
    return errors;
  };
  const results = await Promise.all([light ? runEffects(hass, light, variables) : [], music()]);
  return results.flat();
}
