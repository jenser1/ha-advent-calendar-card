import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FLASH_RESTORE_MS,
  MUSIC_START_GRACE_MS,
  MUSIC_START_TIMEOUT_MS,
  clearPendingVolumes,
  restoreVolumes,
  runSimpleEffects,
} from '../src/blocks/simple-effect';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockHass, type MockHass } from './mock-hass';

afterEach(() => {
  vi.useRealTimers();
  clearPendingVolumes();
});

const VARS = { tag: 3, person: 'Jens' };
const names = (hass: MockHass) => hass.serviceCalls.map((call) => `${call.domain}.${call.service}`);

function home(light: string, player = 'idle', volume = 0.2): MockHass {
  const hass = mockHass({
    services: ['light.turn_on', 'light.turn_off', 'media_player.volume_set', 'media_player.play_media'],
  });
  hass.states = {
    'light.baum': { state: light },
    'media_player.kueche': { state: player, attributes: { volume_level: volume } },
  };
  return hass;
}

function setPlayer(hass: MockHass, state: string, volume: number) {
  hass.states = { ...hass.states, 'media_player.kueche': { state, attributes: { volume_level: volume } } };
}

const FLASH: AdventCalendarCardConfig = { type: 'x', effect_light: { entity_id: 'light.baum' } };
const MUSIC: AdventCalendarCardConfig = {
  type: 'x',
  effect_music: { entity_id: 'media_player.kueche', player: 'media_player', media_id: '/local/a.mp3', volume: 50 },
};

describe('Licht: Zustand nach dem Blinken', () => {
  it('schaltet eine vorher ausgeschaltete Lampe wieder aus', async () => {
    vi.useFakeTimers();
    const hass = home('off');
    await runSimpleEffects(hass, FLASH, VARS);
    expect(names(hass)).toEqual(['light.turn_on']);
    await vi.advanceTimersByTimeAsync(FLASH_RESTORE_MS);
    expect(names(hass)).toEqual(['light.turn_on', 'light.turn_off']);
    expect(hass.serviceCalls[1].target).toEqual({ entity_id: 'light.baum' });
  });

  it('lässt eine eingeschaltete Lampe an', async () => {
    vi.useFakeTimers();
    const hass = home('on');
    await runSimpleEffects(hass, FLASH, VARS);
    await vi.advanceTimersByTimeAsync(FLASH_RESTORE_MS * 2);
    expect(names(hass)).toEqual(['light.turn_on']);
  });

  it('lässt einen Lichteffekt laufen', async () => {
    vi.useFakeTimers();
    const hass = home('off');
    await runSimpleEffects(
      hass,
      { type: 'x', effect_light: { entity_id: 'light.baum', mode: 'effect', effect: 'Rainbow' } },
      VARS,
    );
    await vi.advanceTimersByTimeAsync(FLASH_RESTORE_MS * 2);
    expect(names(hass)).toEqual(['light.turn_on']);
  });
});

describe('Musik: Lautstärke danach zurück', () => {
  it('stellt die alte Lautstärke zurück, wenn die Musik zu Ende ist', async () => {
    const hass = home('on');
    await runSimpleEffects(hass, MUSIC, VARS);
    const start = Date.now();
    setPlayer(hass, 'playing', 0.5);
    restoreVolumes(hass, start + 1000);
    setPlayer(hass, 'idle', 0.5);
    restoreVolumes(hass, start + MUSIC_START_GRACE_MS + 5000);
    const last = hass.serviceCalls[hass.serviceCalls.length - 1];
    expect(`${last.domain}.${last.service}`).toBe('media_player.volume_set');
    expect(last.data).toEqual({ volume_level: 0.2 });
    // Nur einmal.
    restoreVolumes(hass, start + MUSIC_START_GRACE_MS + 9000);
    expect(names(hass).filter((name) => name === 'media_player.volume_set')).toHaveLength(2);
  });

  it('wartet beim Anlaufen (kurzer Stopp beim Titelwechsel)', async () => {
    const hass = home('on', 'playing');
    await runSimpleEffects(hass, MUSIC, VARS);
    const start = Date.now();
    setPlayer(hass, 'idle', 0.5);
    restoreVolumes(hass, start + 2000);
    expect(names(hass).filter((name) => name === 'media_player.volume_set')).toHaveLength(1);
  });

  it('stellt zurück, wenn die Musik gar nicht startet', async () => {
    const hass = home('on');
    await runSimpleEffects(hass, MUSIC, VARS);
    const start = Date.now();
    setPlayer(hass, 'idle', 0.5);
    restoreVolumes(hass, start + MUSIC_START_GRACE_MS + 1000);
    expect(names(hass).filter((name) => name === 'media_player.volume_set')).toHaveLength(1);
    restoreVolumes(hass, start + MUSIC_START_TIMEOUT_MS + 1000);
    expect(hass.serviceCalls[hass.serviceCalls.length - 1].data).toEqual({ volume_level: 0.2 });
  });

  it('lässt eine selbst geänderte Lautstärke in Ruhe', async () => {
    const hass = home('on');
    await runSimpleEffects(hass, MUSIC, VARS);
    const start = Date.now();
    setPlayer(hass, 'playing', 0.5);
    restoreVolumes(hass, start + 1000);
    setPlayer(hass, 'idle', 0.8);
    restoreVolumes(hass, start + MUSIC_START_GRACE_MS + 5000);
    expect(names(hass).filter((name) => name === 'media_player.volume_set')).toHaveLength(1);
  });

  it('merkt sich nichts ohne eingestellte Lautstärke', async () => {
    const hass = home('on');
    const config: AdventCalendarCardConfig = {
      type: 'x',
      effect_music: { entity_id: 'media_player.kueche', player: 'media_player', media_id: '/local/a.mp3' },
    };
    await runSimpleEffects(hass, config, VARS);
    setPlayer(hass, 'idle', 0.2);
    restoreVolumes(hass, Date.now() + MUSIC_START_TIMEOUT_MS + 1000);
    expect(names(hass)).toEqual(['media_player.play_media']);
  });
});
