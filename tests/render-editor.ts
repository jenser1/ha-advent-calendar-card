import '../src/advent-calendar-card';
import type { AdventCalendarCardConfig } from '../src/types';
import { mockHass, type MockHass } from './mock-hass';
import { TYPE, settle } from './render-card';

export type FormElement = HTMLElement & {
  data: Record<string, unknown>;
  schema: { name: string }[];
};

export type Editor = HTMLElementTagNameMap['advent-calendar-card-editor'];

type Updating = HTMLElement & { updateComplete: Promise<boolean> };

export const last = <T>(items: T[]): T => items[items.length - 1];

export async function renderEditor(
  config: Omit<AdventCalendarCardConfig, 'type'>,
  options: { isAdmin?: boolean; hass?: MockHass } = {},
) {
  const editor = document.createElement('advent-calendar-card-editor');
  editor.hass = options.hass ?? mockHass({ isAdmin: options.isAdmin ?? true });
  editor.setConfig({ type: TYPE, ...config });
  const changes: AdventCalendarCardConfig[] = [];
  editor.addEventListener('config-changed', (event) => {
    changes.push((event as CustomEvent<{ config: AdventCalendarCardConfig }>).detail.config);
  });
  document.body.append(editor);
  await settle(editor);
  return { editor, changes };
}

/** Das Element des gerade offenen Tabs. */
export function tabElement(editor: HTMLElement): Updating {
  return editor.shadowRoot!.querySelector<Updating>('.tabs + div > *')!;
}

/** Alle Elemente zu `selector` im offenen Tab, auch innerhalb verschachtelter Editor-Elemente. */
export function deepQueryAll<T extends Element>(root: Element | ShadowRoot, selector: string): T[] {
  const found = [...root.querySelectorAll<T>(selector)];
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot && element.tagName.toLowerCase().startsWith('advent-calendar-editor')) {
      found.push(...deepQueryAll<T>(element.shadowRoot, selector));
    }
  }
  return found;
}

export function forms(editor: HTMLElement): FormElement[] {
  return deepQueryAll<FormElement>(tabElement(editor).shadowRoot!, 'ha-form');
}

/** Wartet, bis Editor, offener Tab und darin verschachtelte Editor-Elemente gerendert sind. */
export async function settleEditor(editor: Editor) {
  await settle(editor);
  const tab = tabElement(editor);
  await settle(tab);
  for (const nested of deepQueryAll<Updating>(tab.shadowRoot!, '[class], *')) {
    if (nested.tagName.toLowerCase().startsWith('advent-calendar-editor')) {
      await nested.updateComplete;
    }
  }
}

/** Simuliert eine Eingabe in <ha-form>: HA meldet immer den kompletten neuen Datensatz. */
export async function change(editor: Editor, form: FormElement, patch: Record<string, unknown>) {
  form.dispatchEvent(
    new CustomEvent('value-changed', { detail: { value: { ...form.data, ...patch } }, bubbles: true }),
  );
  await settleEditor(editor);
}

export async function openTab(editor: Editor, label: string) {
  const tab = [...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>('.tab')].find(
    (button) => button.textContent?.trim() === label,
  )!;
  tab.click();
  await settleEditor(editor);
}

export function buttons(editor: HTMLElement, text: string): HTMLButtonElement[] {
  return deepQueryAll<HTMLButtonElement>(tabElement(editor).shadowRoot!, 'button').filter((b) =>
    b.textContent?.includes(text),
  );
}

export async function click(editor: Editor, button: HTMLButtonElement) {
  button.click();
  await settleEditor(editor);
  await settleEditor(editor);
}
