import { describe, expect, it } from 'vitest';
import {
  findMissing,
  normalizeEffects,
  prepareCall,
  runEffects,
  runSharedEffects,
  sharedEffectMarker,
  validateEffect,
} from '../src/blocks/effect';
import { mockHass } from './mock-hass';

const vars = { tag: 5, person: 'jens' };

describe('validateEffect', () => {
  const check = (value: unknown) => () => validateEffect(value, 'doors.5.effect');

  it('akzeptiert action oder service, einzeln oder als Liste', () => {
    expect(check({ action: 'script.advent_lichtshow' })).not.toThrow();
    expect(
      check({ service: 'script.turn_on', target: { entity_id: 'script.advent_lichtshow' } }),
    ).not.toThrow();
    expect(
      check([
        { action: 'light.turn_on', target: { entity_id: ['light.flur', 'light.kueche'] }, data: { flash: 'long' } },
        { action: 'media_player.play_media', target: { area_id: 'wohnzimmer' }, data: {} },
      ]),
    ).not.toThrow();
  });

  it('meldet fehlende oder falsch geschriebene Dienste', () => {
    expect(check({})).toThrow(/braucht „action“/);
    expect(check({ action: 'lichtshow' })).toThrow(/„doors\.5\.effect\.action“ muss die Form „domain\.dienst“/);
    expect(check({ service: 'Script.Turn_On' })).toThrow(/„doors\.5\.effect\.service“/);
    expect(check({ action: 'a.b', service: 'a.b' })).toThrow(/nur „action“ oder „service“/);
  });

  it('prüft data, target und unbekannte Schlüssel', () => {
    expect(check({ action: 'light.turn_on', data: 'hell' })).toThrow(/„doors\.5\.effect\.data“/);
    expect(check({ action: 'light.turn_on', target: 'light.flur' })).toThrow(/„doors\.5\.effect\.target“/);
    expect(check({ action: 'light.turn_on', target: { entity: 'light.flur' } })).toThrow(
      /„doors\.5\.effect\.target\.entity“ gibt es nicht/,
    );
    expect(check({ action: 'light.turn_on', target: { entity_id: [] } })).toThrow(/eine ID oder eine Liste/);
    expect(check({ action: 'light.turn_on', entitiy_id: 'light.flur' })).toThrow(/„doors\.5\.effect\.entitiy_id“/);
  });

  it('nennt in Listen die Nummer des fehlerhaften Eintrags', () => {
    expect(check([{ action: 'light.turn_on' }, { action: 'kaputt' }])).toThrow(/„doors\.5\.effect\.2\.action“/);
    expect(check([])).toThrow(/leere Liste/);
  });
});

describe('prepareCall', () => {
  it('gibt script.turn_on die Variablen unter data.variables mit', () => {
    expect(
      prepareCall({ service: 'script.turn_on', target: { entity_id: 'script.advent_lichtshow' } }, vars),
    ).toEqual({
      domain: 'script',
      service: 'turn_on',
      data: { variables: { tag: 5, person: 'jens' } },
      target: { entity_id: 'script.advent_lichtshow' },
    });
  });

  it('lässt eigene Variablen aus der YAML gewinnen', () => {
    const call = prepareCall(
      { action: 'script.turn_on', data: { variables: { person: 'Papa', farbe: 'rot' } } },
      vars,
    );
    expect(call.data).toEqual({ variables: { tag: 5, person: 'Papa', farbe: 'rot' } });
  });

  it('gibt direkt aufgerufenen Scripts die Variablen in data', () => {
    expect(prepareCall({ action: 'script.advent_lichtshow' }, vars).data).toEqual({ tag: 5, person: 'jens' });
    expect(prepareCall({ action: 'script.advent_lichtshow', data: { tag: 99 } }, vars).data).toEqual({
      tag: 99,
      person: 'jens',
    });
  });

  it('verändert andere Dienste nicht', () => {
    expect(prepareCall({ action: 'light.turn_on', data: { brightness_pct: 80 } }, vars).data).toEqual({
      brightness_pct: 80,
    });
    expect(prepareCall({ action: 'script.turn_off' }, vars).data).toBeUndefined();
  });
});

describe('findMissing', () => {
  const hass = mockHass({
    services: ['script.turn_on', 'script.advent_lichtshow', 'light.turn_on'],
    entities: ['script.advent_lichtshow', 'light.flur'],
  });

  it('findet nichts, wenn alles da ist', () => {
    expect(findMissing(prepareCall({ action: 'script.advent_lichtshow' }, vars), hass)).toBeUndefined();
    expect(
      findMissing(prepareCall({ action: 'light.turn_on', target: { entity_id: ['light.flur', 'all'] } }, vars), hass),
    ).toBeUndefined();
  });

  it('meldet fehlende Dienste, Scripts und Entitäten', () => {
    expect(findMissing(prepareCall({ action: 'light.toggle' }, vars), hass)).toBe(
      'Dienst „light.toggle“ gibt es nicht.',
    );
    expect(findMissing(prepareCall({ action: 'script.advent_musik' }, vars), hass)).toBe(
      '„script.advent_musik“ gibt es nicht.',
    );
    expect(
      findMissing(prepareCall({ action: 'script.turn_on', target: { entity_id: 'script.fehlt' } }, vars), hass),
    ).toBe('„script.fehlt“ gibt es nicht.');
  });

  it('überspringt die Prüfung, wenn HA keine Dienste/Zustände liefert', () => {
    const bare = mockHass();
    delete bare.services;
    delete bare.states;
    expect(findMissing(prepareCall({ action: 'script.egal' }, vars), bare)).toBeUndefined();
  });
});

describe('runEffects', () => {
  it('ruft alle Dienste ohne HA-eigenen Fehler-Toast auf', async () => {
    const hass = mockHass({
      services: ['script.advent_lichtshow', 'light.turn_on'],
      entities: ['light.flur'],
    });
    const errors = await runEffects(
      hass,
      [{ action: 'script.advent_lichtshow' }, { action: 'light.turn_on', target: { entity_id: 'light.flur' } }],
      vars,
    );

    expect(errors).toEqual([]);
    expect(hass.serviceCalls).toEqual([
      { domain: 'script', service: 'advent_lichtshow', data: vars, target: undefined, notifyOnError: false },
      { domain: 'light', service: 'turn_on', data: undefined, target: { entity_id: 'light.flur' }, notifyOnError: false },
    ]);
  });

  it('sammelt Fehler und löst die übrigen Effekte trotzdem aus', async () => {
    const hass = mockHass({ services: ['light.turn_on', 'media_player.play_media'] });
    hass.failService = 'media_player.play_media';

    const errors = await runEffects(
      hass,
      [{ action: 'script.fehlt' }, { action: 'media_player.play_media' }, { action: 'light.turn_on' }],
      vars,
    );

    expect(errors).toEqual([
      '„script.fehlt“ gibt es nicht.',
      'media_player.play_media: Unable to find referenced entities',
    ]);
    expect(hass.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual([
      'media_player.play_media',
      'light.turn_on',
    ]);
  });

  it('macht ohne Effekt nichts', async () => {
    const hass = mockHass();
    expect(normalizeEffects(undefined)).toEqual([]);
    expect(await runEffects(hass, undefined, vars)).toEqual([]);
    expect(hass.serviceCalls).toEqual([]);
  });
});

describe('gemeinsame Effekte einmal pro Tag', () => {
  const HELPER = 'input_text.adventskalender';
  const nikolaus = { action: 'script.advent_nikolaus' };
  const once = { helper: HELPER, marker: sharedEffectMarker(2026, 6, false) };
  const home = (helperState?: string) =>
    mockHass({
      services: ['script.advent_nikolaus', 'input_text.set_value'],
      states: helperState === undefined ? {} : { [HELPER]: helperState },
    });
  const called = (hass: ReturnType<typeof mockHass>) =>
    hass.serviceCalls.map((c) => `${c.domain}.${c.service}`);

  it('bildet den Merker aus Datum und Testmodus', () => {
    expect(sharedEffectMarker(2026, 6, false)).toBe('2026-12-06');
    expect(sharedEffectMarker(2026, 24, true)).toBe('test:2026-12-24');
  });

  it('setzt zuerst den Merker und löst dann aus', async () => {
    const hass = home('');
    expect(await runSharedEffects(hass, nikolaus, vars, once)).toEqual([]);
    expect(called(hass)).toEqual(['input_text.set_value', 'script.advent_nikolaus']);
    expect(hass.serviceCalls[0]).toMatchObject({ data: { value: '2026-12-06' }, target: { entity_id: HELPER } });
    expect(hass.states![HELPER].state).toBe('2026-12-06');
  });

  it('löst nicht aus, wenn der Merker für heute schon gesetzt ist', async () => {
    const hass = home('2026-12-06');
    expect(await runSharedEffects(hass, nikolaus, vars, once)).toEqual([]);
    expect(hass.serviceCalls).toEqual([]);
  });

  it('lässt sich von einem Test-Merker nicht blockieren', async () => {
    const hass = home('test:2026-12-06');
    await runSharedEffects(hass, nikolaus, vars, once);
    expect(called(hass)).toEqual(['input_text.set_value', 'script.advent_nikolaus']);
  });

  it('löst ohne Helfer bei jedem Aufruf aus', async () => {
    const hass = home();
    await runSharedEffects(hass, nikolaus, vars, { marker: once.marker });
    await runSharedEffects(hass, nikolaus, vars, undefined);
    expect(called(hass)).toEqual(['script.advent_nikolaus', 'script.advent_nikolaus']);
  });

  it('meldet einen fehlenden Helfer und löst trotzdem aus', async () => {
    const hass = home();
    expect(await runSharedEffects(hass, nikolaus, vars, once)).toEqual([
      'Helfer „input_text.adventskalender“ gibt es nicht.',
    ]);
    expect(called(hass)).toEqual(['script.advent_nikolaus']);
  });

  it('meldet, wenn der Merker nicht gesetzt werden kann, und löst trotzdem aus', async () => {
    const hass = home('');
    hass.failService = 'input_text.set_value';
    expect(await runSharedEffects(hass, nikolaus, vars, once)).toEqual([
      'Helfer „input_text.adventskalender“: Unable to find referenced entities',
    ]);
    expect(called(hass)).toEqual(['input_text.set_value', 'script.advent_nikolaus']);
  });

  it('fasst den Helfer ohne gemeinsamen Effekt nicht an', async () => {
    const hass = home('');
    expect(await runSharedEffects(hass, undefined, vars, once)).toEqual([]);
    expect(hass.serviceCalls).toEqual([]);
  });
});
