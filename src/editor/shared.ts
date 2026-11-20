import { css } from 'lit';
import { THEMES, type ThemeName } from '../themes';
import type { AdventCalendarCardConfig, SharedMode } from '../types';

/** Ein Feld für HAs <ha-form>; `selector` entspricht den HA-Selectors (text, number, select …). */
export interface FormField {
  name: string;
  selector: Record<string, unknown>;
  disabled?: boolean;
}

export const THEME_LABELS: Record<ThemeName, string> = {
  winter: 'Winter – Nachtblau & Gold',
  kids: 'Kids – bunt, große Zahlen',
  nerd: 'Nerd – Terminal',
};

export const THEME_OPTIONS = THEMES.map((theme) => ({ value: theme, label: THEME_LABELS[theme] }));

export const SHARED_MODE_LABELS: Record<SharedMode, string> = {
  off: 'Aus – nur persönliche Türchen',
  merge: 'Zusätzlich – „Für alle“ und „Für dich“',
  replace: 'Statt persönlich – alle sehen dasselbe',
};

export const SHARED_MODE_OPTIONS = (Object.keys(SHARED_MODE_LABELS) as SharedMode[]).map((mode) => ({
  value: mode,
  label: SHARED_MODE_LABELS[mode],
}));

/** Inhaltlich gleich (Reihenfolge der Schlüssel egal)? Für Configs aus YAML/JSON-Werten. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** Meldet eine geänderte Config an den Editor bzw. an HA. */
export function fireConfigChanged(element: HTMLElement, config: AdventCalendarCardConfig): void {
  element.dispatchEvent(
    new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }),
  );
}

/** Setzt einen Schlüssel oder entfernt ihn bei undefined; die Reihenfolge der übrigen bleibt. */
export function setOrDelete<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

type CardHelpers = {
  createCardElement(config: Record<string, unknown>): Promise<HTMLElement> | HTMLElement;
};

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

let loading: Promise<void> | undefined;

/**
 * HA lädt <ha-form> und die Selectors erst, wenn ein eingebauter Karten-Editor sie
 * braucht. Über die Card-Helpers den Editor der Entities-Karte anfordern lädt sie mit.
 */
export function loadHaFormComponents(): Promise<void> {
  if (customElements.get('ha-form')) {
    return Promise.resolve();
  }
  loading ??= (async () => {
    try {
      const helpers = await window.loadCardHelpers?.();
      const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
      const ctor = card?.constructor as { getConfigElement?: () => Promise<unknown> } | undefined;
      await ctor?.getConfigElement?.();
    } catch {
      // Ohne Card-Helpers (z. B. außerhalb von HA) bleibt nur der YAML-Editor.
    }
  })();
  return loading;
}

export const editorStyles = css`
  :host {
    display: block;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .intro,
  .hint {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 0.9em;
    line-height: 1.4;
  }

  .error-text {
    margin: 0;
    color: var(--error-color, #db4437);
    font-size: 0.9em;
  }

  .box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 12px;
  }

  .box-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 500;
  }

  .button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    font: inherit;
    padding: 6px 14px;
    border-radius: 18px;
    border: 1px solid var(--primary-color, #03a9f4);
    background: transparent;
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
  }

  .button.danger {
    border-color: var(--error-color, #db4437);
    color: var(--error-color, #db4437);
  }

  .button.small {
    padding: 2px 10px;
    font-size: 0.9em;
  }

  .button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .confirm {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
    font-weight: normal;
  }
`;
