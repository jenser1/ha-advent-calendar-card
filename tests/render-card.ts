import { vi } from 'vitest';
import '../src/advent-calendar-card';
import type { AdventCalendarCardConfig, HomeAssistant } from '../src/types';

export const TYPE = 'custom:advent-calendar-card';
export const KEY = 'advent_calendar_2026';
export const TEST_KEY = 'advent_calendar_2026_test';

/** Wartet, bis Laden/Speichern über den (gemockten) WebSocket durch ist. */
export async function settle(element: HTMLElement & { updateComplete: Promise<boolean> }) {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
}

export async function renderCard(
  config: Omit<AdventCalendarCardConfig, 'type'>,
  hass?: HomeAssistant,
) {
  const card = document.createElement('advent-calendar-card');
  card.setConfig({ type: TYPE, ...config });
  card.hass = hass;
  document.body.append(card);
  await settle(card);
  return card;
}

/** Türchen sortiert nach Tag (Index = Tag − 1), unabhängig von der gemischten Anzeige. */
export function doors(card: HTMLElement) {
  return displayedDoors(card).sort((a, b) => a.day - b.day);
}

/** Türchen in der angezeigten Reihenfolge. */
export function displayedDoors(card: HTMLElement) {
  return [...card.shadowRoot!.querySelectorAll('advent-calendar-door')];
}

/**
 * Simuliert die Geräteeinstellungen „Bewegung reduzieren“ und hell/dunkel.
 * Standard in Tests: Bewegung reduziert, damit Dialoge ohne Animation sofort öffnen.
 */
export function setMediaPreferences(options: { reducedMotion?: boolean; dark?: boolean } = {}) {
  const { reducedMotion = true, dark = false } = options;
  window.matchMedia = ((query: string) => ({
    matches:
      (query.includes('prefers-reduced-motion: reduce') && reducedMotion) ||
      (query.includes('prefers-color-scheme: dark') && dark),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

setMediaPreferences();

export function statuses(card: HTMLElement) {
  return doors(card).map((door) => door.status);
}

export function toasts(card: HTMLElement): string[] {
  const messages: string[] = [];
  card.addEventListener('hass-notification', (event) => {
    messages.push((event as CustomEvent<{ message: string }>).detail.message);
  });
  return messages;
}

export function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
