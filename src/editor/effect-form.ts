import type {
  AdventCalendarCardConfig,
  EffectCall,
  HomeAssistant,
  LightEffectConfig,
  LightMode,
  MusicEffectConfig,
  MusicPlayer,
} from '../types';
import { MAX_DURATION, MIN_DURATION } from '../blocks/simple-effect';
import { setOrDelete, type FormField } from './shared';

/** Wert der Medienauswahl von HA (Selector „media“). */
export interface MediaPick {
  entity_id?: string;
  media_content_id?: string;
  media_content_type?: string;
  metadata?: Record<string, unknown>;
}

/** Daten des Formulars „Effekt beim ersten Öffnen“ im Tab „Allgemein“. */
export interface EffectFormData {
  light_entity?: string;
  light_mode?: LightMode;
  light_effect?: string;
  light_duration?: number;
  music_entity?: string;
  music_player?: MusicPlayer;
  music_pick?: MediaPick;
  music_media?: string;
  music_volume?: number;
  music_days?: string[];
  music_controls?: boolean;
  effect: EffectCall[];
}

export const EFFECT_LABELS: Record<string, string> = {
  light_entity: 'Licht',
  light_mode: 'Was das Licht macht',
  light_effect: 'Lichteffekt',
  light_duration: 'Wie lange',
  music_entity: 'Musik auf',
  music_player: 'Abspielen über',
  music_pick: 'Aus Medien auswählen',
  music_media: 'Titel oder Adresse',
  music_volume: 'Lautstärke',
  music_days: 'Musik an welchen Türchen',
  music_controls: 'Musik-Tasten im Türchen',
  effect: 'Erweitert: eigene Aktionen',
};

export const EFFECT_HELPERS: Record<string, string> = {
  light_entity: 'Bei jedem Türchen. Leer lassen für kein Licht.',
  light_effect: 'Effekte aus der Liste der Lampe, z. B. bei WLED „Rainbow“.',
  light_duration:
    'Danach ist die Lampe wieder wie vorher (aus bzw. mit alter Farbe oder altem Effekt). Leer lassen, damit der Effekt weiterläuft.',
  music_entity: 'Leer lassen für keine Musik.',
  music_pick:
    'Am einfachsten: durch deine Medien klicken – eigene Dateien (Medien → Lokale Medien), Music Assistant, Radio. Trägt Titel und Art selbst ein und stellt auf „Mediaplayer“.',
  music_media:
    'Music Assistant: Titel, Album oder Playlist aus deiner Bibliothek (z. B. „Last Christmas“) oder die volle Adresse einer Datei (http://…). Mediaplayer: Adresse einer Datei oder eines Streams. Eigene Dateien nach /config/www/ legen und mit voller Adresse eintragen, z. B. http://homeassistant.local:8123/local/advent/lied.mp3 – am besten ohne Leerzeichen im Namen.',
  music_volume: 'Leer lassen, um die Lautstärke nicht zu ändern.',
  music_days: 'Leer lassen für jedes Türchen.',
  music_controls: 'Zeigt im geöffneten Türchen Pause, Weiter und Stopp – und „Abspielen“, um das Lied noch einmal zu hören.',
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

/** Was die Medienauswahl anzeigt: Player und – beim Mediaplayer – das gewählte Medium. */
function mediaPick(music: MusicEffectConfig | undefined): MediaPick | undefined {
  if (!music?.entity_id) {
    return undefined;
  }
  if (music.player === 'music_assistant' || !music.media_id) {
    return { entity_id: music.entity_id };
  }
  return {
    entity_id: music.entity_id,
    media_content_id: music.media_id,
    media_content_type: music.media_type ?? 'music',
  };
}

/**
 * HA friert die Config im Karten-Editor ein. Sein Aktions-Editor will Aufrufen ohne `data`
 * aber `data: {}` anhängen bzw. `service` in `action` umschreiben – auf eingefrorenen
 * Objekten wirft das („object is not extensible“). Darum bekommt er solche Aufrufe ergänzt:
 * noch offene Objekte direkt (die Identität bleibt, sonst klappt die Zeile zu), eingefrorene
 * als gemerkte Kopie (pro Objekt immer dieselbe).
 */
const editableCopies = new WeakMap<object, EffectCall>();

function needsFix(call: EffectCall): boolean {
  if (!call || typeof call !== 'object') {
    return false;
  }
  const isCall = typeof call.action === 'string' || typeof call.service === 'string';
  return isCall && (!('data' in call) || 'service' in call);
}

function fixCall(call: EffectCall): void {
  if (typeof call.service === 'string' && !call.action) {
    call.action = call.service;
  }
  delete call.service;
  if (!('data' in call)) {
    call.data = {};
  }
}

export function editableCall(call: EffectCall): EffectCall {
  if (!needsFix(call)) {
    return call;
  }
  if (!Object.isFrozen(call)) {
    fixCall(call);
    return call;
  }
  let copy = editableCopies.get(call);
  if (!copy) {
    copy = { ...call };
    fixCall(copy);
    editableCopies.set(call, copy);
  }
  return copy;
}

function editableCalls(calls: EffectCall[]): EffectCall[] {
  return calls.some(needsFix) ? calls.map(editableCall) : calls;
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
    light_duration: light?.duration,
    music_entity: music?.entity_id,
    music_player: music?.player ?? defaultPlayer(hass),
    music_pick: mediaPick(music),
    music_media: music?.media_id,
    music_volume: music?.volume,
    music_days: (music?.days ?? []).map(String),
    music_controls: music?.controls !== false,
    effect: editableCalls(Array.isArray(config.effect) ? config.effect : config.effect ? [config.effect] : []),
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
      fields.push({
        name: 'light_duration',
        selector: { number: { min: MIN_DURATION, max: 60, step: 1, mode: 'box', unit_of_measurement: 's' } },
      });
    }
  }
  fields.push({ name: 'music_entity', selector: { entity: { domain: 'media_player' } } });
  if (music?.entity_id) {
    fields.push(
      { name: 'music_player', selector: { select: { mode: 'dropdown', options: MUSIC_PLAYER_OPTIONS } } },
      { name: 'music_pick', selector: { media: {} } },
      { name: 'music_media', selector: { text: {} } },
      {
        name: 'music_volume',
        selector: { number: { min: 0, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } },
      },
      { name: 'music_days', selector: { select: { multiple: true, mode: 'dropdown', options: DAY_OPTIONS } } },
      { name: 'music_controls', selector: { boolean: {} } },
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
    const duration = value.light_duration;
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      light.duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(duration)));
    }
  }
  return light;
}

function musicConfig(
  value: EffectFormData,
  hass: HomeAssistant | undefined,
  previous: MusicEffectConfig | undefined,
): MusicEffectConfig | undefined {
  let entity = value.music_entity;
  let player = value.music_player ?? defaultPlayer(hass);
  let media = value.music_media?.trim() || undefined;
  let type = previous?.media_type;
  const pick = value.music_pick;
  // Player in der Medienauswahl gewechselt.
  if (pick?.entity_id && pick.entity_id !== previous?.entity_id) {
    entity = pick.entity_id;
  }
  const picked = pick?.media_content_id && pick.media_content_id !== mediaPick(previous)?.media_content_id;
  if (picked) {
    // Aus Medien gewählt: Die IDs gehören zu media_player.play_media dieses Players.
    entity = pick.entity_id ?? entity;
    player = 'media_player';
    media = pick.media_content_id;
    type = pick.media_content_type || undefined;
  } else if (media !== previous?.media_id) {
    // Von Hand getippt: Die Art aus einer früheren Auswahl passt nicht mehr.
    type = undefined;
  }
  if (!entity) {
    return undefined;
  }
  const music: MusicEffectConfig = { entity_id: entity, player };
  if (media) {
    music.media_id = media;
  }
  if (type && player === 'media_player' && media) {
    music.media_type = type;
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
  // Standard ist „an“: nur das Abschalten wird gespeichert.
  if (value.music_controls === false) {
    music.controls = false;
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
  setOrDelete(next, 'effect_music', musicConfig(value, hass, next.effect_music));
  setOrDelete(
    next,
    'effect',
    Array.isArray(value.effect) && value.effect.length > 0 ? editableCalls(value.effect) : undefined,
  );
}
