// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMusicState, resetBrowserMusic } from '../src/blocks/browser-music';
import { controlMusic, musicCalls, musicControlFor } from '../src/blocks/simple-effect';
import type { MusicEffectConfig } from '../src/types';
import { mockHass } from './mock-hass';
import { TYPE, doors, renderCard, setNow, settle, toasts } from './render-card';
import { change, forms, last, renderEditor } from './render-editor';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static block = false;
  src = '';
  volume = 1;
  paused = true;
  played: string[] = [];
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
  async play() {
    this.played.push(this.src);
    if (FakeAudio.block) {
      throw Object.assign(new Error('blockiert'), { name: 'NotAllowedError' });
    }
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

const player = () => FakeAudio.instances.find((item) => item.played.length > 0)!;

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.block = false;
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  resetBrowserMusic();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const MUSIC: MusicEffectConfig = { player: 'browser', media_id: '/local/advent/lied.mp3', volume: 40, days: [6] };

async function openDoor(day: number, music: MusicEffectConfig = MUSIC, hass = mockHass()) {
  setNow(`2026-12-${String(day).padStart(2, '0')}T12:00:00Z`);
  const card = await renderCard({ year: 2026, users: { jens: {} }, effect_music: music }, hass);
  const messages = toasts(card);
  doors(card)[day - 1].click();
  const atClick = player()?.played.length ?? 0;
  for (let i = 0; i < 4; i++) {
    await settle(card);
  }
  const dialog = card.shadowRoot!.querySelector('advent-calendar-dialog')!;
  await settle(dialog);
  return { card, dialog, hass, atClick, messages };
}

const buttons = (dialog: HTMLElement) =>
  [...dialog.shadowRoot!.querySelectorAll<HTMLButtonElement>('.music button')].map((b) => b.dataset.action);

describe('Musik auf diesem Gerät (player: browser)', () => {
  it('schaltet beim Tippen frei und spielt danach das Lied, ohne Dienste aufzurufen', async () => {
    const { dialog, hass, atClick } = await openDoor(6);
    expect(atClick).toBe(1);
    expect(player().played[0]).toContain('data:audio/wav');
    expect(last(player().played)).toMatch(/\/local\/advent\/lied\.mp3$/);
    expect(player().volume).toBe(0.4);
    expect(hass.serviceCalls).toEqual([]);
    expect(musicCalls(MUSIC, 6)).toEqual([]);
    expect(buttons(dialog)).toEqual(['pause', 'stop']);
    expect(dialog.shadowRoot!.querySelector('.music .title')!.textContent).toContain('lied');
    expect(dialog.shadowRoot!.querySelector('.music .player')!.textContent).toBe('Dieses Gerät');
  });

  it('bedient Pause, Weiter, Regler, Stopp und Abspielen', async () => {
    const { card, dialog, hass } = await openDoor(6);
    const click = async (action: string) => {
      dialog.shadowRoot!.querySelector<HTMLButtonElement>(`.music button[data-action="${action}"]`)!.click();
      await settle(card);
      await settle(dialog);
    };
    await click('pause');
    expect(buttons(dialog)).toEqual(['play', 'stop']);
    await click('play');
    expect(buttons(dialog)).toEqual(['pause', 'stop']);

    const slider = dialog.shadowRoot!.querySelector<HTMLInputElement>('.volume input')!;
    slider.value = '70';
    slider.dispatchEvent(new Event('change'));
    expect(player().volume).toBe(0.7);

    await click('stop');
    expect(buttons(dialog)).toEqual(['replay']);
    await click('replay');
    expect(buttons(dialog)).toEqual(['pause', 'stop']);
    expect(player().volume).toBe(0.4);

    player().dispatchEvent(new Event('ended'));
    await settle(card);
    await settle(dialog);
    expect(buttons(dialog)).toEqual(['replay']);
    expect(hass.serviceCalls).toEqual([]);
  });

  it('lässt sich auch in einem anderen Türchen stoppen, solange es läuft', async () => {
    const { hass } = await openDoor(6);
    expect(musicControlFor(hass, MUSIC, 5)?.state).toBe('playing');
    await controlMusic(hass, MUSIC, 'stop', { tag: 5, person: '' });
    expect(player().paused).toBe(true);
    expect(musicControlFor(hass, MUSIC, 5)).toBeUndefined();
  });

  it('bleibt an anderen Türchen still', async () => {
    const { dialog } = await openDoor(5);
    expect(FakeAudio.instances.flatMap((item) => item.played)).toEqual([]);
    expect(dialog.shadowRoot!.querySelector('.music')).toBeNull();
  });

  it('löst Dateien aus „Medien“ über Home Assistant auf', async () => {
    const hass = mockHass();
    const callWS = hass.callWS;
    hass.callWS = async <T>(msg: { type: string; [key: string]: unknown }) =>
      msg.type === 'media_source/resolve_media'
        ? ({ url: '/media/local/baum.mp3?authSig=x', mime_type: 'audio/mpeg' } as T)
        : callWS<T>(msg);
    await openDoor(6, { ...MUSIC, media_id: 'media-source://media_source/local/baum.mp3' }, hass);
    expect(last(player().played)).toMatch(/\/media\/local\/baum\.mp3\?authSig=x$/);
  });

  it('erklärt eine Autoplay-Sperre und bietet „Abspielen“ an', async () => {
    FakeAudio.block = true;
    const { dialog, messages } = await openDoor(6);
    expect(browserMusicState()).toBe('idle');
    expect(buttons(dialog)).toEqual(['replay']);
    expect(messages.join()).toContain('Abspielen');
  });

  it('nimmt nur Adressen, keine Music-Assistant-Titel oder Skripte', async () => {
    for (const media_id of ['library://track/36', 'javascript:alert(1)', 'Last Christmas']) {
      const { messages } = await openDoor(6, { ...MUSIC, media_id });
      expect(messages.join()).toContain('braucht es eine Adresse');
      expect(player().played.every((src) => src.startsWith('data:audio/wav'))).toBe(true);
      document.body.replaceChildren();
    }
  });
});

describe('Editor: Musik auf diesem Gerät', () => {
  it('braucht keinen Player und lässt sich wieder abwählen', async () => {
    const { editor, changes } = await renderEditor({});
    await change(editor, forms(editor)[1], { music_player: 'browser' });
    expect(last(changes).effect_music).toEqual({ player: 'browser' });
    const names = forms(editor)[1].schema.map((field) => field.name);
    expect(names).not.toContain('music_entity');
    expect(names).toContain('music_pick');

    await change(editor, forms(editor)[1], {
      music_pick: { media_content_id: 'media-source://media_source/local/baum.mp3', media_content_type: 'audio/mpeg' },
    });
    expect(last(changes).effect_music).toEqual({
      player: 'browser',
      media_id: 'media-source://media_source/local/baum.mp3',
    });

    await change(editor, forms(editor)[1], { music_player: undefined });
    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('wechselt von einem Player auf dieses Gerät, ohne unbrauchbaren Titel', async () => {
    const { editor, changes } = await renderEditor({
      effect_music: { entity_id: 'media_player.a', player: 'music_assistant', media_id: 'library://track/36', volume: 10 },
    });
    await change(editor, forms(editor)[1], { music_player: 'browser' });
    expect(last(changes).effect_music).toEqual({ player: 'browser', volume: 10 });
  });
});
