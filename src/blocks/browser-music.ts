import type { HomeAssistant } from '../types';

/**
 * Musik direkt auf dem Gerät, das den Kalender anzeigt (effect_music.player: browser).
 * Es gibt genau einen Abspieler pro Seite, gemeinsam für alle Karten.
 */

export type BrowserMusicState = 'idle' | 'playing' | 'paused';

/** 0,05 s Stille: schaltet den Abspieler beim Tippen frei (Autoplay-Sperre der Browser). */
const SILENCE = `data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACA${'gICA'.repeat(133)}`;

let element: HTMLAudioElement | undefined;
let state: BrowserMusicState = 'idle';
let unlocked = false;
let volumeSettable: boolean | undefined;
/** Wird bei jedem Start und Stopp erhöht: Ein langsamer älterer Start darf nicht mehr loslegen. */
let request = 0;
const listeners = new Set<() => void>();

function setState(next: BrowserMusicState): void {
  if (state !== next) {
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  }
}

function audio(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    // Nur das Lied zählt, nicht die Stille zum Freischalten.
    const whenActive = (action: () => void) => () => {
      if (state !== 'idle') {
        action();
      }
    };
    element.addEventListener('playing', whenActive(() => setState('playing')));
    element.addEventListener('pause', whenActive(() => element!.paused && setState('paused')));
    element.addEventListener('ended', whenActive(() => setState('idle')));
    element.addEventListener('error', whenActive(() => setState('idle')));
  }
  return element;
}

/** Meldet Zustandsänderungen. Verschwindet die letzte Karte, hört die Musik auf. */
export function onBrowserMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // HA hängt Karten manchmal nur um; darum kurz warten.
    window.setTimeout(() => {
      if (listeners.size === 0) {
        stopBrowserMusic();
      }
    }, 1000);
  };
}

export function browserMusicState(): BrowserMusicState {
  return state;
}

export function browserVolume(): number {
  return element?.volume ?? 1;
}

/** iPhone und iPad lassen die Lautstärke nur über die Gerätetasten ändern. */
export function canSetBrowserVolume(): boolean {
  if (volumeSettable === undefined) {
    const probe = new Audio();
    probe.volume = 0.5;
    volumeSettable = probe.volume === 0.5;
  }
  return volumeSettable;
}

/** Muss direkt beim Tippen laufen, bevor auf den Server gewartet wird. */
export function unlockBrowserMusic(): void {
  if (unlocked || state !== 'idle') {
    return;
  }
  const player = audio();
  player.src = SILENCE;
  Promise.resolve(player.play()).then(
    () => (unlocked = true),
    () => undefined,
  );
}

async function resolveUrl(hass: HomeAssistant, media: string): Promise<string> {
  if (media.startsWith('media-source://')) {
    const { url } = await hass.callWS<{ url: string }>({
      type: 'media_source/resolve_media',
      media_content_id: media,
    });
    return new URL(url, window.location.href).href;
  }
  if (!/^(https?:\/\/|\/)/i.test(media)) {
    throw new Error('Für „Dieses Gerät“ braucht es eine Adresse (http://…, /local/…) oder eine Datei aus „Medien“.');
  }
  return new URL(media, window.location.href).href;
}

function setVolume(volume: number): void {
  audio().volume = Math.min(1, Math.max(0, volume));
}

/** Spielt das Lied von vorn. Liefert Fehler. */
export async function playBrowserMusic(
  hass: HomeAssistant,
  media: string,
  volume: number | undefined,
): Promise<string[]> {
  const current = ++request;
  try {
    const url = await resolveUrl(hass, media);
    if (current !== request) {
      return [];
    }
    const player = audio();
    player.src = url;
    setVolume(volume ?? 1);
    setState('playing');
    await player.play();
    unlocked = true;
    return [];
  } catch (err) {
    if (current !== request) {
      return [];
    }
    setState('idle');
    const error = err as { name?: string; message?: string };
    if (error?.name === 'NotAllowedError') {
      return ['Der Browser hat die Musik blockiert. Öffne das Türchen und tippe auf „Abspielen“.'];
    }
    if (error?.name === 'NotSupportedError') {
      return ['Dieses Gerät kann die Musikdatei nicht laden oder abspielen.'];
    }
    return [`Musik: ${error?.message ?? String(err)}`];
  }
}

export function pauseBrowserMusic(): void {
  element?.pause();
}

export async function resumeBrowserMusic(): Promise<string[]> {
  try {
    await audio().play();
    return [];
  } catch (err) {
    return [`Musik: ${(err as Error)?.message ?? String(err)}`];
  }
}

export function stopBrowserMusic(): void {
  request++;
  setState('idle');
  element?.pause();
}

export function setBrowserVolume(volume: number): void {
  setVolume(volume);
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Nur für Tests. */
export function resetBrowserMusic(): void {
  stopBrowserMusic();
  element = undefined;
  unlocked = false;
  listeners.clear();
}
