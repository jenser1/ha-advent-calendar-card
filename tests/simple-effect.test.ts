// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lightCall, musicCalls } from '../src/blocks/simple-effect';
import { mockHass } from './mock-hass';
import { TYPE, doors, renderCard, setNow, settle } from './render-card';
import { change, forms, last, renderEditor } from './render-editor';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function home() {
  return mockHass({
    services: [
      'light.turn_on',
      'media_player.volume_set',
      'media_player.play_media',
      'music_assistant.play_media',
    ],
    entities: ['light.wohnzimmer', 'media_player.wohnzimmer'],
  });
}

async function clickDoor(card: HTMLElementTagNameMap['advent-calendar-card'], day: number) {
  doors(card)[day - 1].click();
  await settle(card);
  await settle(card);
}

const names = (calls: { domain: string; service: string }[]) =>
  calls.map((call) => `${call.domain}.${call.service}`);

describe('Licht und Musik ohne YAML (effect_light, effect_music)', () => {
  it('baut die Aufrufe für das Licht', () => {
    expect(lightCall(undefined)).toBeUndefined();
    expect(lightCall({ mode: 'flash' })).toBeUndefined();
    expect(lightCall({ entity_id: 'light.a' })).toEqual({
      action: 'light.turn_on',
      target: { entity_id: 'light.a' },
      data: { flash: 'short' },
    });
    expect(lightCall({ entity_id: 'light.a', mode: 'effect', effect: ' Rainbow ' })?.data).toEqual({
      effect: 'Rainbow',
    });
    // Ohne Effektnamen bleibt es beim Blinken.
    expect(lightCall({ entity_id: 'light.a', mode: 'effect' })?.data).toEqual({ flash: 'short' });
  });

  it('baut die Aufrufe für die Musik, nur an den gewählten Türchen', () => {
    const music = { entity_id: 'media_player.a', player: 'music_assistant' as const, media_id: 'Last Christmas', volume: 30, days: [6, 24] };
    expect(musicCalls(music, 5)).toEqual([]);
    expect(musicCalls(music, 6)).toEqual([
      { action: 'media_player.volume_set', target: { entity_id: 'media_player.a' }, data: { volume_level: 0.3 } },
      {
        action: 'music_assistant.play_media',
        target: { entity_id: 'media_player.a' },
        data: { media_id: 'Last Christmas', enqueue: 'replace' },
      },
    ]);
    expect(musicCalls({ entity_id: 'media_player.a', media_id: '/local/jingle.mp3' }, 3)).toEqual([
      {
        action: 'media_player.play_media',
        target: { entity_id: 'media_player.a' },
        data: { media_content_id: '/local/jingle.mp3', media_content_type: 'music' },
      },
    ]);
    expect(musicCalls({ entity_id: 'media_player.a' }, 3)).toEqual([]);
  });

  it('lässt beim Öffnen Licht blinken und spielt Musik – erst Lautstärke, dann Titel', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = home();
    const card = await renderCard(
      {
        year: 2026,
        users: { jens: {} },
        effect_light: { entity_id: 'light.wohnzimmer' },
        effect_music: {
          entity_id: 'media_player.wohnzimmer',
          player: 'music_assistant',
          media_id: 'Last Christmas',
          volume: 30,
          days: [6],
        },
      },
      hass,
    );

    await clickDoor(card, 6);

    expect(names(hass.serviceCalls).sort()).toEqual([
      'light.turn_on',
      'media_player.volume_set',
      'music_assistant.play_media',
    ]);
    const music = names(hass.serviceCalls).filter((name) => name !== 'light.turn_on');
    expect(music).toEqual(['media_player.volume_set', 'music_assistant.play_media']);
  });

  it('spielt an anderen Türchen keine Musik, das Licht blinkt trotzdem', async () => {
    setNow('2026-12-05T12:00:00Z');
    const hass = home();
    const card = await renderCard(
      {
        year: 2026,
        users: { jens: {} },
        effect_light: { entity_id: 'light.wohnzimmer' },
        effect_music: { entity_id: 'media_player.wohnzimmer', media_id: 'x.mp3', days: [6] },
      },
      hass,
    );

    await clickDoor(card, 5);

    expect(names(hass.serviceCalls)).toEqual(['light.turn_on']);
  });

  it('meldet falsche Angaben verständlich', () => {
    const card = document.createElement('advent-calendar-card');
    const set = (extra: Record<string, unknown>) => () => card.setConfig({ type: TYPE, ...extra } as never);
    expect(set({ effect_light: { entity_id: 'switch.x' } })).toThrow('„effect_light.entity_id“ muss eine light-Entität sein');
    expect(set({ effect_light: { entity_id: 'light.x', mode: 'disco' } })).toThrow('„effect_light.mode“');
    expect(set({ effect_light: { entity_id: 'light.x', farbe: 'rot' } })).toThrow('„effect_light.farbe“ gibt es nicht.');
    expect(set({ effect_music: { entity_id: 'light.x' } })).toThrow('media_player-Entität');
    expect(set({ effect_music: { volume: 150 } })).toThrow('0 bis 100');
    expect(set({ effect_music: { days: [0, 25] } })).toThrow('[6, 24]');
    expect(set({ effect_music: { player: 'spotify' } })).toThrow('„effect_music.player“');
  });
});

describe('Editor: Effekt-Bereich im Tab „Allgemein“', () => {
  it('zeigt erst nur Licht, Musik und „Erweitert“', async () => {
    const { editor } = await renderEditor({});
    expect(forms(editor)[1].schema.map((field) => field.name)).toEqual(['light_entity', 'music_entity', 'effect']);
  });

  it('bietet die Lichteffekte der Lampe zur Auswahl an', async () => {
    const hass = home();
    hass.states!['light.wohnzimmer'] = { state: 'on', attributes: { effect_list: ['Rainbow', 'Fireworks'] } };
    const { editor, changes } = await renderEditor(
      { effect_light: { entity_id: 'light.wohnzimmer', mode: 'effect' } },
      { hass },
    );

    const field = forms(editor)[1].schema.find((item) => item.name === 'light_effect') as unknown as {
      selector: { select: { options: string[] } };
    };
    expect(field.selector.select.options).toEqual(['Rainbow', 'Fireworks']);

    await change(editor, forms(editor)[1], { light_effect: 'Fireworks' });
    expect(last(changes).effect_light).toEqual({ entity_id: 'light.wohnzimmer', mode: 'effect', effect: 'Fireworks' });

    await change(editor, forms(editor)[1], { light_duration: 8 });
    expect(last(changes).effect_light).toEqual({
      entity_id: 'light.wohnzimmer',
      mode: 'effect',
      effect: 'Fireworks',
      duration: 8,
    });

    await change(editor, forms(editor)[1], { light_mode: 'flash' });
    expect(last(changes).effect_light).toEqual({ entity_id: 'light.wohnzimmer' });
    expect(forms(editor)[1].schema.some((item) => item.name === 'light_duration')).toBe(false);
  });

  it('schreibt die Musik mit Music Assistant als Standard, wenn es installiert ist', async () => {
    const { editor, changes } = await renderEditor({}, { hass: home() });

    await change(editor, forms(editor)[1], { music_entity: 'media_player.wohnzimmer' });
    expect(last(changes).effect_music).toEqual({ entity_id: 'media_player.wohnzimmer', player: 'music_assistant' });
    expect(forms(editor)[1].schema.map((field) => field.name)).toEqual([
      'light_entity',
      'music_entity',
      'music_player',
      'music_pick',
      'music_media',
      'music_volume',
      'music_days',
      'music_controls',
      'effect',
    ]);

    await change(editor, forms(editor)[1], { music_media: 'Last Christmas', music_volume: 30, music_days: ['24', '6'] });
    expect(last(changes).effect_music).toEqual({
      entity_id: 'media_player.wohnzimmer',
      player: 'music_assistant',
      media_id: 'Last Christmas',
      volume: 30,
      days: [6, 24],
    });

    await change(editor, forms(editor)[1], { music_entity: undefined });
    expect(last(changes)).toEqual({ type: TYPE });
  });

  it('übernimmt Player, Medium und Art aus der Medienauswahl', async () => {
    const { editor, changes } = await renderEditor(
      { effect_music: { entity_id: 'media_player.wohnzimmer', player: 'music_assistant', media_id: 'Last Christmas' } },
      { hass: home() },
    );
    expect(forms(editor)[1].data.music_pick).toEqual({ entity_id: 'media_player.wohnzimmer' });

    await change(editor, forms(editor)[1], {
      music_pick: {
        entity_id: 'media_player.kueche',
        media_content_id: 'media-source://media_source/local/advent/baum.mp3',
        media_content_type: 'audio/mpeg',
        metadata: { title: 'baum.mp3' },
      },
    });
    expect(last(changes).effect_music).toEqual({
      entity_id: 'media_player.kueche',
      player: 'media_player',
      media_id: 'media-source://media_source/local/advent/baum.mp3',
      media_type: 'audio/mpeg',
    });
    expect(forms(editor)[1].data.music_pick).toEqual({
      entity_id: 'media_player.kueche',
      media_content_id: 'media-source://media_source/local/advent/baum.mp3',
      media_content_type: 'audio/mpeg',
    });

    // Lautstärke ändern behält die Auswahl.
    await change(editor, forms(editor)[1], { music_volume: 40 });
    expect(last(changes).effect_music?.media_type).toBe('audio/mpeg');

    // Von Hand getippt: Die Art passt nicht mehr und fällt weg.
    await change(editor, forms(editor)[1], { music_media: 'http://ha:8123/local/lied.mp3' });
    expect(last(changes).effect_music).toEqual({
      entity_id: 'media_player.kueche',
      player: 'media_player',
      media_id: 'http://ha:8123/local/lied.mp3',
      volume: 40,
    });
  });

  it('übernimmt einen in der Medienauswahl gewechselten Player', async () => {
    const { editor, changes } = await renderEditor(
      { effect_music: { entity_id: 'media_player.wohnzimmer', player: 'media_player' } },
      { hass: home() },
    );

    await change(editor, forms(editor)[1], { music_pick: { entity_id: 'media_player.kueche' } });
    expect(last(changes).effect_music).toEqual({ entity_id: 'media_player.kueche', player: 'media_player' });
  });

  it('spielt Ausgewähltes mit der passenden Art ab', () => {
    expect(
      musicCalls({ entity_id: 'media_player.a', media_id: 'media-source://x/baum.mp3', media_type: 'audio/mpeg' }, 1),
    ).toEqual([
      {
        action: 'media_player.play_media',
        target: { entity_id: 'media_player.a' },
        data: { media_content_id: 'media-source://x/baum.mp3', media_content_type: 'audio/mpeg' },
      },
    ]);
    const card = document.createElement('advent-calendar-card');
    expect(() =>
      card.setConfig({ type: TYPE, effect_music: { entity_id: 'media_player.a', media_type: 3 } } as never),
    ).toThrow('„effect_music.media_type“ muss ein Text sein.');
  });

  it('nimmt ohne Music Assistant den normalen Mediaplayer', async () => {
    const { editor, changes } = await renderEditor({}, { hass: mockHass({ isAdmin: true }) });

    await change(editor, forms(editor)[1], { music_entity: 'media_player.kueche' });
    expect(last(changes).effect_music).toEqual({ entity_id: 'media_player.kueche', player: 'media_player' });
  });
});
