// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../src/advent-calendar-card';
import type { AdventCalendarCardConfig } from '../src/types';

const TYPE = 'custom:advent-calendar-card';

async function renderCard(config: AdventCalendarCardConfig) {
  const card = document.createElement('advent-calendar-card');
  card.setConfig(config);
  document.body.append(card);
  await card.updateComplete;
  return card;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('advent-calendar-card', () => {
  it('registriert sich als Element und im Karten-Picker', () => {
    expect(customElements.get('advent-calendar-card')).toBeDefined();
    expect(customElements.get('advent-calendar-door')).toBeDefined();
    expect(window.customCards?.some((c) => c.type === 'advent-calendar-card')).toBe(true);
  });

  it('zeigt 24 Türchen von 1 bis 24', async () => {
    const card = await renderCard({ type: TYPE });
    const doors = [...card.shadowRoot!.querySelectorAll('advent-calendar-door')];

    expect(doors.map((door) => door.day)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));

    await doors[23].updateComplete;
    expect(doors[23].shadowRoot!.textContent).toContain('24');
  });

  it('nutzt den Titel aus der Config', async () => {
    const card = await renderCard({ type: TYPE, title: 'Jens’ Kalender' });
    expect(card.shadowRoot!.querySelector('.card-header')?.textContent).toBe('Jens’ Kalender');
  });

  it('bildet den Standardtitel aus dem Jahr', async () => {
    const card = await renderCard({ type: TYPE, year: 2026 });
    expect(card.shadowRoot!.querySelector('.card-header')?.textContent).toBe('Adventskalender 2026');
  });

  it('blendet den Titel bei leerem String aus', async () => {
    const card = await renderCard({ type: TYPE, title: '' });
    expect(card.shadowRoot!.querySelector('.card-header')).toBeNull();
  });

  it('lehnt ungültige Jahreszahlen ab', () => {
    const card = document.createElement('advent-calendar-card');
    expect(() => card.setConfig({ type: TYPE, year: 26 })).toThrow(/year/);
    expect(() => card.setConfig({ type: TYPE, year: '2026' as unknown as number })).toThrow(/year/);
  });
});
