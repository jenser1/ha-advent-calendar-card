import type {
  AdventCalendarCardConfig,
  EffectCall,
  HomeAssistant,
  LightEffectConfig,
  LightMode,
  MusicEffectConfig,
  MusicPlayer,
} from '../types';
import { setOrDelete, type FormField } from './shared';

/** Daten des Formulars „Effekt beim ersten Öffnen“ im Tab „Allgemein“. */
export interface EffectFormData {
  light_entity?: string;
  light_mode?: LightMode;
  light_effect?: string;
  music_entity?: string;
  music_player?: MusicPlayer;
  music_media?: string;
  music_volume?: number;
  music_days?: string[];
  effect: EffectCall[];
}

export const EFFECT_LABELS: Record<string, string> = {
  light_entity: 'Licht',
  light_mode: 'Was das Licht macht',
  light_effect: 'Lichteffekt',
  music_entity: 'Musik auf',
  music_player: 'Abspielen über',
  music_media: 'Titel oder Adresse',
  music_volume: 'Lautstärke',
  music_days: 'Musik an welchen Türchen',
  effect: 'Erweitert: eigene Aktionen',
};

export const EFFECT_HELPERS: Record<string, string> = {
  light_entity: 'Bei jedem Türchen. Leer lassen für kein Licht.',
  light_effect: 'Effekte aus der Liste der Lampe, z. B. bei WLED „Rainbow“.',
  music_entity: 'Leer lassen für keine Musik.',
  music_media:
    'Music Assistant: Name von Titel, Album oder Playlist, z. B. „Last Christmas“. Mediaplayer: Adresse einer Datei oder eines Streams.',
  music_volume: 'Leer lassen, um die Lautstärke nicht zu ändern.',
  music_days: 'Leer lassen für jedes Türchen.',
  effect:
    'Für Profis: beliebige Aktionen oder ein Script. Scripts bekommen tag (Nummer des Türchens) und person mit.',
};

const LIGHT_MODE_OPTIONS: { value: LightMode; label: string }[] = [
  { value: 'flash', label: 'Kurz blinken' },
  { value: 'effect', label: 'Lichteffekt starten' },
];

const MUSIC_PLAYER_OPTIONS: { value: MusicPlayer; label: string }[] = [
  { value: 'music_assistant', label: 'Music Assistant – Titel oder Name' },
  { value: 'media_player', label: 'Mediaplayer – Datei- oder Stream-Adresse' },
];

const DAY_OPTIONS = Array.from({ length: 24 }, (_, index) => ({
  value: String(index + 1),
  label: `Türchen ${index + 1}`,
}));

/** Music Assistant, wenn es installiert ist – sonst der normale Mediaplayer. */
function defaultPlayer(hass: HomeAssistant | undefined): MusicPlayer {
  return hass?.services?.music_assistant?.play_media ? 'music_assistant' : 'media_player';
}

/** Lichteffekte, die die gewählte Lampe kennt (Attribut effect_list). */
function effectList(hass: HomeAssistant | undefined, entity: string | undefined): string[] {
  const list = entity ? hass?.states?.[entity]?.attributes?.effect_list : undefined;
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
}

export function effectFormData(
  config: AdventCalendarCardConfig,
  hass: HomeAssistant | undefined,
): EffectFormData {
  const light = config.effect_light;
  const music = config.effect_music;
  return {
    light_entity: light?.entity_id,
    light_mode: light?.mode ?? 'flash',
    light_effect: light?.effect,
    music_entity: music?.entity_id,
    music_player: music?.player ?? defaultPlayer(hass),
    music_media: music?.media_id,
    music_volume: music?.volume,
    music_days: (music?.days ?? []).map(String),
    effect: Array.isArray(config.effect) ? config.effect : config.effect ? [config.effect] : [],
  };
}

/** Felder je nach Auswahl: Lichteffekt nur bei „Lichteffekt starten“, Musik-Details erst mit Player. */
export function effectFormSchema(
  config: AdventCalendarCardConfig,
  hass: HomeAssistant | undefined,
): FormField[] {
  const light = config.effect_light;
  const music = config.effect_music;
  const effects = effectList(hass, light?.entity_id);
  const fields: FormField[] = [{ name: 'light_entity', selector: { entity: { domain: 'light' } } }];
  if (light?.entity_id) {
    fields.push({
      name: 'light_mode',
      selector: { select: { mode: 'dropdown', options: LIGHT_MODE_OPTIONS } },
    });
    if (light.mode === 'effect') {
      fields.push({
        name: 'light_effect',
        selector:
          effects.length > 0
            ? { select: { mode: 'dropdown', custom_value: true, options: effects } }
            : { text: {} },
      });
    }
  }
  fields.push({ name: 'music_entity', selector: { entity: { domain: 'media_player' } } });
  if (music?.entity_id) {
    fields.push(
      { name: 'music_player', selector: { select: { mode: 'dropdown', options: MUSIC_PLAYER_OPTIONS } } },
      { name: 'music_media', selector: { text: {} } },
      {
        name: 'music_volume',
        selector: { number: { min: 0, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } },
      },
      { name: 'music_days', selector: { select: { multiple: true, mode: 'dropdown', options: DAY_OPTIONS } } },
    );
  }
  fields.push({ name: 'effect', selector: { action: {} } });
  return fields;
}

function lightConfig(value: EffectFormData): LightEffectConfig | undefined {
  if (!value.light_entity) {
    return undefined;
  }
  const light: LightEffectConfig = { entity_id: value.light_entity };
  if (value.light_mode === 'effect') {
    light.mode = 'effect';
    if (value.light_effect?.trim()) {
      light.effect = value.light_effect.trim();
    }
  }
  return light;
}

function musicConfig(value: EffectFormData, hass: HomeAssistant | undefined): MusicEffectConfig | undefined {
  if (!value.music_entity) {
    return undefined;
  }
  const music: MusicEffectConfig = {
    entity_id: value.music_entity,
    player: value.music_player ?? defaultPlayer(hass),
  };
  if (value.music_media?.trim()) {
    music.media_id = value.music_media.trim();
  }
  if (typeof value.music_volume === 'number') {
    music.volume = value.music_volume;
  }
  const days = (value.music_days ?? [])
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 24)
    .sort((a, b) => a - b);
  if (days.length > 0) {
    music.days = [...new Set(days)];
  }
  return music;
}

/** Überträgt das Formular in die Config; leere Bereiche fallen ganz weg. */
export function applyEffectForm(
  next: AdventCalendarCardConfig,
  value: EffectFormData,
  hass: HomeAssistant | undefined,
): void {
  setOrDelete(next, 'effect_light', lightConfig(value));
  setOrDelete(next, 'effect_music', musicConfig(value, hass));
  setOrDelete(
    next,
    'effect',
    Array.isArray(value.effect) && value.effect.length > 0 ? value.effect : undefined,
  );
}
