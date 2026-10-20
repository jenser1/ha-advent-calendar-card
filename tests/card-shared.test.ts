// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockHass } from './mock-hass';
import { KEY, TEST_KEY, doors, renderCard, setNow, settle, toasts } from './render-card';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const HELPER = 'input_text.adventskalender';

type CardConfig = Omit<AdventCalendarCardConfig, 'type'>;

const family = (shared: CardConfig['shared'], extra: CardConfig = {}): CardConfig => ({
  year: 2026,
  users: {
    jens: { user_id: 'id-jens', doors: { 6: { text: 'Für Jens' } } },
    anna: { user_id: 'id-anna', doors: { 6: { text: 'Für Anna' } } },
  },
  shared,
  ...extra,
});

function jens(options: Parameters<typeof mockHass>[0] = {}) {
  return mockHass({
    userId: 'id-jens',
    services: ['script.advent_nikolaus', 'input_text.set_value'],
    entities: ['script.advent_nikolaus'],
    ...options,
  });
}

function dialogOf(card: HTMLElement) {
  return card.shadowRoot!.querySelector('advent-calendar-dialog')!;
}

function inner(card: HTMLElement) {
  return dialogOf(card).shadowRoot!.querySelector('.inner')!;
}

/** Klassen bzw. Überschriften der Dialog-Inhalte (ohne Kopfzeile) in Reihenfolge */
function sections(card: HTMLElement) {
  return [...inner(card).children]
    .filter((el) => el.tagName !== 'HEADER')
    .map((el) => (el.tagName === 'H3' ? `# ${el.textContent}` : el.textContent?.trim()));
}

async function openSixth(card: HTMLElementTagNameMap['advent-calendar-card']) {
  doors(card)[5].click();
  await settle(card);
  await settle(card);
  await settle(dialogOf(card));
}

describe('Gemeinsame Inhalte im Dialog', () => {
  it('zeigt bei merge erst „Für alle“, dann „Für dich“', async () => {
    setNow('2026-12-06T12:00:00Z');
    const card = await renderCard(family({ doors: { 6: { text: 'Nikolaus für alle 🥾' } } }), jens());

    await openSixth(card);

    expect(sections(card)).toEqual(['# 🎄 Für alle', 'Nikolaus für alle 🥾', '# Für dich', 'Für Jens']);
  });

  it('zeigt bei replace nur den gemeinsamen Inhalt, ohne Überschriften', async () => {
    setNow('2026-12-06T12:00:00Z');
    const card = await renderCard(
      family({ mode: 'replace', doors: { 6: { text: 'Alle gleich' } } }),
      jens(),
    );

    await openSixth(card);

    expect(sections(card)).toEqual(['Alle gleich']);
  });

  it('nutzt den Modus des einzelnen Türchens', async () => {
    setNow('2026-12-06T12:00:00Z');
    const card = await renderCard(
      family({ mode: 'off', doors: { 6: { mode: 'replace', text: 'Nikolaus!' } } }),
      jens(),
    );

    await openSixth(card);

    expect(sections(card)).toEqual(['Nikolaus!']);
  });

  it('zeigt gemeinsamen Inhalt auch Personen ohne eigenen Inhalt an dem Tag', async () => {
    setNow('2026-12-06T12:00:00Z');
    const card = await renderCard(
      {
        year: 2026,
        users: { jens: { user_id: 'id-jens' } },
        shared: { doors: { 6: { text: 'Für alle' } } },
      },
      jens(),
    );

    await openSixth(card);

    expect(sections(card)).toEqual(['Für alle']);
  });

  it('speichert Erledigt für gemeinsame und persönliche Aufgaben getrennt', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens();
    const card = await renderCard(
      {
        year: 2026,
        users: { jens: { user_id: 'id-jens', doors: { 6: { task: 'Gutschein für Jens' } } } },
        shared: { doors: { 6: { task: 'Alle zusammen Plätzchen backen' } } },
      },
      hass,
    );
    await openSixth(card);

    const toggles = () => [...inner(card).querySelectorAll<HTMLButtonElement>('.done-toggle')];
    toggles()[0].click(); // gemeinsame Aufgabe steht oben
    await settle(card);
    await settle(dialogOf(card));

    expect(toggles().map((b) => b.textContent?.trim())).toEqual(['Erledigt ✔', 'Als erledigt markieren']);
    expect(hass.userData.get(KEY)).toMatchObject({
      done: {},
      shared_done: { 6: '2026-12-06T12:00:00.000Z' },
    });
  });
});

describe('Gemeinsame Effekte', () => {
  const nikolaus = { doors: { 6: { text: 'Nikolaus!', effect: { action: 'script.advent_nikolaus' } } } };

  it('löst den gemeinsamen Effekt mit Helfer nur einmal pro Tag aus', async () => {
    setNow('2026-12-06T12:00:00Z');
    const config = family({ ...nikolaus, effect_helper: HELPER });
    const states = { [HELPER]: '' };

    const hassJens = jens({ states });
    const cardJens = await renderCard(config, hassJens);
    await openSixth(cardJens);
    expect(hassJens.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual([
      'input_text.set_value',
      'script.advent_nikolaus',
    ]);

    // Anna öffnet später – der Helfer steht jetzt auf dem heutigen Tag.
    const hassAnna = jens({ userId: 'id-anna', states: { [HELPER]: hassJens.states![HELPER].state } });
    const cardAnna = await renderCard(config, hassAnna);
    await openSixth(cardAnna);
    expect(hassAnna.serviceCalls).toEqual([]);
  });

  it('löst persönliche Effekte bei merge trotzdem für jede Person aus', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens({
      services: ['script.advent_nikolaus', 'light.turn_on', 'input_text.set_value'],
      states: { [HELPER]: '2026-12-06' },
    });
    const card = await renderCard(
      {
        year: 2026,
        users: {
          jens: { user_id: 'id-jens', doors: { 6: { effect: { action: 'light.turn_on' } } } },
        },
        shared: { ...nikolaus, effect_helper: HELPER },
      },
      hass,
    );

    await openSixth(card);

    expect(hass.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual(['light.turn_on']);
  });

  it('ignoriert persönliche Effekte bei replace', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens({ services: ['script.advent_nikolaus', 'light.turn_on'] });
    const card = await renderCard(
      {
        year: 2026,
        users: { jens: { user_id: 'id-jens', doors: { 6: { effect: { action: 'light.turn_on' } } } } },
        shared: { mode: 'replace', effect_once: false, ...nikolaus },
      },
      hass,
    );

    await openSixth(card);

    expect(hass.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual(['script.advent_nikolaus']);
  });

  it('löst ohne Helfer bei jeder Person aus und zeigt Admins einen Hinweis', async () => {
    setNow('2026-12-06T12:00:00Z');
    const hass = jens({ isAdmin: true });
    const card = await renderCard(family(nikolaus), hass);

    expect(card.shadowRoot!.querySelector('.notice')?.textContent).toContain('shared.effect_helper');
    await openSixth(card);
    expect(hass.serviceCalls.map((c) => `${c.domain}.${c.service}`)).toEqual(['script.advent_nikolaus']);
  });

  it('zeigt Nicht-Admins keinen Hinweis und mit effect_once: false auch Admins nicht', async () => {
    const plain = await renderCard(family(nikolaus), jens());
    const disabled = await renderCard(family({ ...nikolaus, effect_once: false }), jens({ isAdmin: true }));

    expect(plain.shadowRoot!.querySelector('.notice')).toBeNull();
    expect(disabled.shadowRoot!.querySelector('.notice')).toBeNull();
  });

  it('warnt Admins, wenn der eingetragene Helfer fehlt', async () => {
    const card = await renderCard(family({ ...nikolaus, effect_helper: HELPER }), jens({ isAdmin: true }));
    expect(card.shadowRoot!.querySelector('.notice')?.textContent).toContain('„input_text.adventskalender“ gibt es nicht');
  });

  it('nutzt im Testmodus einen Test-Merker und setzt ihn beim Zurücksetzen zurück', async () => {
    setNow('2026-10-20T10:00:00Z');
    const hass = jens({ isAdmin: true, states: { [HELPER]: '' } });
    const card = await renderCard(
      family({ ...nikolaus, effect_helper: HELPER }, { year: undefined, debug_date: '2026-12-06' }),
      hass,
    );
    const messages = toasts(card);

    await openSixth(card);
    expect(hass.states![HELPER].state).toBe('test:2026-12-06');
    expect(hass.userData.has(TEST_KEY)).toBe(true);

    card.shadowRoot!.querySelector<HTMLButtonElement>('.reset')!.click();
    await settle(card);
    await settle(card);

    expect(hass.states![HELPER].state).toBe('');
    expect(messages).toEqual(['Testdaten zurückgesetzt.']);
  });
});
