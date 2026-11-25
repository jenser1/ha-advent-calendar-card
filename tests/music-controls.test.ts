// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPendingVolumes, musicControlFor, restoreVolumes, validateSimpleEffects } from '../src/blocks/simple-effect';
import type { AdventCalendarCardConfig, MusicEffectConfig } from '../src/types';
import { mockHass, type MockHass } from './mock-hass';
import { doors, renderCard, setNow, settle } from './render-card';
import { change, forms, last, renderEditor } from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearPendingVolumes();
});

const MUSIC: MusicEffectConfig = {
  entity_id: 'media_player.soundbar',
  player: 'media_player',
  media_id: 'library://track/36',
  volume: 35,
  days: [6],
};

function home(state = 'idle'): MockHass {
  const hass = mockHass({
    services: [
      'media_player.volume_set',
      'media_player.play_media',
      'media_player.media_pause',
      'media_player.media_play',
      'media_player.media_stop',
    ],
  });
  hass.states = {
    'media_player.soundbar': {
      state,
      attributes: { volume_level: 0.2, friendly_name: 'Soundbar', media_title: 'Weihnachtsbaum' },
    },
  };
  return hass;
}

/** Wie HA: ein neues hass-Objekt mit neuem Zustand des Players. */
function setPlayer(card: HTMLElement, hass: MockHass, state: string) {
  const current = (card as unknown as { _hass: MockHass })._hass ?? hass;
  const states = {
    ...current.states,
    'media_player.soundbar': { ...current.states!['media_player.soundbar'], state },
  };
  (card as unknown as { hass: MockHass }).hass = { ...hass, states };
}

async function openDoor(day: number, hass: MockHass, extra: Partial<AdventCalendarCardConfig> = {}) {
  setNow(`2026-12-${String(day).padStart(2, '0')}T12:00:00Z`);
  const card = await renderCard({ year: 2026, users: { jens: {} }, effect_music: MUSIC, ...extra }, hass);
  doors(card)[day - 1].click();
  await settle(card);
  await settle(card);
  const dialog = card.shadowRoot!.querySelector('advent-calendar-dialog')!;
  await settle(dialog);
  return { card, dialog };
}

const buttons = (dialog: HTMLElement) =>
  [...dialog.shadowRoot!.querySelectorAll<HTMLButtonElement>('.music button')].map((b) => b.dataset.action);

describe('Musik-Tasten im Türchen', () => {
  it('gibt es nur an Türchen mit Musik und mit vorhandenem Player', () => {
    const hass = home();
    expect(musicControlFor(hass, MUSIC, 6)).toEqual({
      entityId: 'media_player.soundbar',
      state: 'idle',
      title: 'Weihnachtsbaum',
      name: 'Soundbar',
      volume: 0.2,
    });
    expect(musicControlFor(hass, MUSIC, 5)).toBeUndefined();
    expect(musicControlFor(hass, { ...MUSIC, controls: false }, 6)).toBeUndefined();
    expect(musicControlFor(hass, { ...MUSIC, entity_id: 'media_player.fehlt' }, 6)).toBeUndefined();
    expect(musicControlFor(hass, { entity_id: 'media_player.soundbar' }, 6)).toBeUndefined();
  });

  it('zeigt je nach Zustand Pause/Stopp, Weiter/Stopp oder Abspielen', async () => {
    const hass = home('playing');
    const { card, dialog } = await openDoor(6, hass);
    expect(buttons(dialog)).toEqual(['pause', 'stop']);
    expect(dialog.shadowRoot!.querySelector('.music .title')!.textContent).toContain('Weihnachtsbaum');

    setPlayer(card, hass, 'paused');
    await settle(card);
    await settle(dialog);
    expect(buttons(dialog)).toEqual(['play', 'stop']);

    setPlayer(card, hass, 'idle');
    await settle(card);
    await settle(dialog);
    expect(buttons(dialog)).toEqual(['replay']);
  });

  it('ruft die passenden Dienste auf', async () => {
    const hass = home('playing');
    const { card, dialog } = await openDoor(6, hass);
    const before = hass.serviceCalls.length;
    const click = async (action: string) => {
      dialog.shadowRoot!.querySelector<HTMLButtonElement>(`.music button[data-action="${action}"]`)!.click();
      await settle(card);
    };

    await click('pause');
    await click('stop');
    setPlayer(card, hass, 'idle');
    await settle(card);
    await settle(dialog);
    await click('replay');

    const names = hass.serviceCalls.slice(before).map((call) => `${call.domain}.${call.service}`);
    expect(names).toEqual([
      'media_player.media_pause',
      'media_player.media_stop',
      'media_player.volume_set',
      'media_player.play_media',
    ]);
    expect(hass.serviceCalls[before].target).toEqual({ entity_id: 'media_player.soundbar' });
  });

  it('hat einen Regler: sendet beim Loslassen, danach kommt trotzdem die alte Lautstärke', async () => {
    const hass = home('playing');
    const { card, dialog } = await openDoor(6, hass);
    const slider = dialog.shadowRoot!.querySelector<HTMLInputElement>('.music .volume input')!;
    expect(slider.value).toBe('20');
    const before = hass.serviceCalls.length;

    slider.value = '50';
    slider.dispatchEvent(new Event('input'));
    await settle(dialog);
    expect(dialog.shadowRoot!.querySelector('.music output')!.textContent).toBe('50 %');
    expect(hass.serviceCalls).toHaveLength(before);

    slider.dispatchEvent(new Event('change'));
    await settle(card);
    expect(hass.serviceCalls).toHaveLength(before + 1);
    expect(hass.serviceCalls[before]).toMatchObject({
      service: 'volume_set',
      data: { volume_level: 0.5 },
      target: { entity_id: 'media_player.soundbar' },
    });

    const player = (state: string) => ({
      ...hass,
      states: { 'media_player.soundbar': { state, attributes: { volume_level: 0.5 } } },
    });
    restoreVolumes(player('playing'), Date.now() + 1000);
    restoreVolumes(player('idle'), Date.now() + 30_000);
    expect(hass.serviceCalls[hass.serviceCalls.length - 1].data).toEqual({ volume_level: 0.2 });
  });

  it('zeigt keinen Regler, wenn nichts läuft oder der Player keine Lautstärke kann', async () => {
    const idle = await openDoor(6, home('idle'));
    expect(idle.dialog.shadowRoot!.querySelector('.volume')).toBeNull();
    const hass = home('playing');
    hass.states!['media_player.soundbar'].attributes!.supported_features = 1;
    expect(musicControlFor(hass, MUSIC, 6)!.volume).toBeUndefined();
  });

  it('zeigt nichts an Türchen ohne Musik oder wenn abgeschaltet', async () => {
    const other = await openDoor(5, home('playing'));
    expect(other.dialog.shadowRoot!.querySelector('.music')).toBeNull();
    document.body.replaceChildren();
    const off = await openDoor(6, home('playing'), { effect_music: { ...MUSIC, controls: false } });
    expect(off.dialog.shadowRoot!.querySelector('.music')).toBeNull();
  });

  it('prüft controls', () => {
    expect(() => validateSimpleEffects({ type: 'x', effect_music: { controls: 'ja' as never } })).toThrow(
      '„effect_music.controls“ muss true oder false sein.',
    );
    expect(() => validateSimpleEffects({ type: 'x', effect_music: { controls: false } })).not.toThrow();
  });

  it('lässt sich im Editor abschalten (gespeichert wird nur das Abschalten)', async () => {
    const hass = home();
    const { editor, changes } = await renderEditor({ effect_music: MUSIC }, { hass });
    expect(forms(editor)[1].data.music_controls).toBe(true);

    await change(editor, forms(editor)[1], { music_controls: false });
    expect(last(changes).effect_music?.controls).toBe(false);

    await change(editor, forms(editor)[1], { music_controls: true });
    expect(last(changes).effect_music && 'controls' in last(changes).effect_music!).toBe(false);
  });
});
