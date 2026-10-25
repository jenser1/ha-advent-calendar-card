import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';
import { parseDebugDate } from '../date-logic';
import { DEFAULT_EMPTY_TEXT } from '../door-dialog';
import { DEFAULT_THEME, isThemeName } from '../themes';
import type { AdventCalendarCardConfig, HomeAssistant } from '../types';
import {
  THEME_OPTIONS,
  editorStyles,
  fireConfigChanged,
  setOrDelete,
  type FormField,
} from './shared';

interface GeneralData {
  title: string;
  hide_title: boolean;
  year?: number;
  theme: string;
  snow: boolean;
  shuffle: boolean;
  empty_text: string;
  debug_date?: string;
}

const LABELS: Record<string, string> = {
  title: 'Überschrift',
  hide_title: 'Überschrift ausblenden',
  year: 'Jahr',
  theme: 'Theme',
  snow: 'Schneefall',
  shuffle: 'Türchen mischen',
  empty_text: 'Text für leere Türchen',
  debug_date: 'Testdatum (nur für Admins)',
};

const HELPERS: Record<string, string> = {
  title: 'Leer lassen für „Adventskalender <Jahr>“.',
  year: 'Leer lassen für das aktuelle Jahr.',
  theme: 'Gilt für alle, die im Tab „Personen“ kein eigenes Theme haben.',
  shuffle: 'Jede Person bekommt eine eigene, feste Reihenfolge.',
  empty_text: `Leer lassen für „${DEFAULT_EMPTY_TEXT}“`,
  debug_date:
    'Nur Admins sehen den Kalender an diesem Tag; Testdaten werden getrennt gespeichert. Leer lassen für das echte Datum.',
};

/** Testdatum als „JJJJ-MM-TT“ für den Datums-Selector (die Config kann auch ein Date enthalten). */
function debugDateValue(value: unknown): string | undefined {
  const date = parseDebugDate(value);
  if (!date) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Tab „Allgemein“: Überschrift, Jahr, Theme, Schnee, Mischen, Leertext, Testdatum. */
export class AdventCalendarEditorGeneral extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config!: AdventCalendarCardConfig;

  static styles = editorStyles;

  private get isAdmin(): boolean {
    return this.hass?.user?.is_admin === true;
  }

  private get data(): GeneralData {
    const config = this.config;
    return {
      title: config.title ?? '',
      hide_title: config.title === '',
      year: config.year,
      theme: config.theme ?? DEFAULT_THEME,
      snow: config.snow ?? false,
      shuffle: config.shuffle ?? true,
      empty_text: config.empty_text ?? '',
      debug_date: debugDateValue(config.debug_date),
    };
  }

  private get schema(): FormField[] {
    const hideTitle = this.config.title === '';
    return [
      { name: 'title', selector: { text: {} }, disabled: hideTitle },
      { name: 'hide_title', selector: { boolean: {} } },
      { name: 'year', selector: { number: { min: 2000, max: 2100, mode: 'box' } } },
      { name: 'theme', selector: { select: { mode: 'dropdown', options: THEME_OPTIONS } } },
      { name: 'snow', selector: { boolean: {} } },
      { name: 'shuffle', selector: { boolean: {} } },
      { name: 'empty_text', selector: { text: { multiline: true } } },
      ...(this.isAdmin ? [{ name: 'debug_date', selector: { date: {} } }] : []),
    ];
  }

  private onValueChanged(event: CustomEvent<{ value: GeneralData }>): void {
    event.stopPropagation();
    const value = event.detail.value;
    const next: AdventCalendarCardConfig = { ...this.config };
    const title = value.title?.trim() ? value.title : undefined;
    setOrDelete(next, 'title', value.hide_title ? '' : title);
    setOrDelete(next, 'year', typeof value.year === 'number' ? value.year : undefined);
    setOrDelete(
      next,
      'theme',
      isThemeName(value.theme) && value.theme !== DEFAULT_THEME ? value.theme : undefined,
    );
    setOrDelete(next, 'snow', value.snow ? true : undefined);
    setOrDelete(next, 'shuffle', value.shuffle === false ? false : undefined);
    setOrDelete(next, 'empty_text', value.empty_text?.trim() ? value.empty_text : undefined);
    if (this.isAdmin) {
      setOrDelete(next, 'debug_date', value.debug_date || undefined);
    }
    fireConfigChanged(this, next);
  }

  render() {
    return html`
      <div class="section">
        <ha-form
          .hass=${this.hass}
          .data=${this.data}
          .schema=${this.schema}
          .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
          .computeHelper=${(field: FormField) => HELPERS[field.name]}
          @value-changed=${this.onValueChanged}
        ></ha-form>
      </div>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-general')) {
  customElements.define('advent-calendar-editor-general', AdventCalendarEditorGeneral);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-general': AdventCalendarEditorGeneral;
  }
}
