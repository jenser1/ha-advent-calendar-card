import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import {
  DEFAULT_JSON_PATH,
  FALLBACK_FILE,
  SHARED_FILE,
  isReservedName,
  jsonPathError,
} from '../content-source';
import { parseDebugDate } from '../date-logic';
import { DEFAULT_EMPTY_TEXT } from '../door-dialog';
import { COMMUNITY_CALENDAR } from '../edition';
import { DEFAULT_THEME, isThemeName } from '../themes';
import type { AdventCalendarCardConfig, ContentSource, HomeAssistant } from '../types';
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
  content_source: ContentSource;
  json_path: string;
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
  content_source: 'Inhaltsquelle',
  json_path: 'Pfad der Dateien',
  debug_date: 'Testdatum (nur für Admins)',
};

const HELPERS: Record<string, string> = {
  title: 'Leer lassen für „Adventskalender <Jahr>“.',
  year: 'Leer lassen für das aktuelle Jahr.',
  theme: 'Gilt für alle, die im Tab „Personen“ kein eigenes Theme haben.',
  shuffle: 'Jede Person bekommt eine eigene, feste Reihenfolge.',
  empty_text: `Leer lassen für „${DEFAULT_EMPTY_TEXT}“`,
  content_source:
    'JSON-Dateien halten die Inhalte aus der Dashboard-Konfiguration heraus. Personen, Themes und Einstellungen bleiben hier.',
  json_path: `{person} = Name aus „Personen“ (dazu „${FALLBACK_FILE}“ und „${SHARED_FILE}“ für Fallback und gemeinsame Türchen), {year} = Jahr. /local/ ist der Ordner /config/www/.`,
  debug_date:
    'Nur Admins sehen den Kalender an diesem Tag; Testdaten werden getrennt gespeichert. Leer lassen für das echte Datum.',
};

const SOURCE_OPTIONS: { value: ContentSource; label: string }[] = [
  { value: 'yaml', label: 'In der Karte (Editor/YAML)' },
  { value: 'json', label: 'JSON-Dateien auf dem Server' },
];

/** Testdatum als „JJJJ-MM-TT“ für den Datums-Selector (die Config kann auch ein Date enthalten). */
function debugDateValue(value: unknown): string | undefined {
  const date = parseDebugDate(value);
  if (!date) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Tab „Allgemein“: Überschrift, Jahr, Theme, Schnee, Mischen, Leertext, Inhaltsquelle, Testdatum. */
export class AdventCalendarEditorGeneral extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config!: AdventCalendarCardConfig;

  /** Pfad, der gerade getippt wird, aber (noch) nicht gültig ist. */
  @state() private pathDraft?: { value: string; error: string };
  /** Warum die Inhaltsquelle nicht umgestellt werden konnte. */
  @state() private sourceError?: string;

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
      content_source: config.content_source ?? 'yaml',
      json_path: this.pathDraft?.value ?? config.json_path ?? DEFAULT_JSON_PATH,
      debug_date: debugDateValue(config.debug_date),
    };
  }

  private get schema(): FormField[] {
    const hideTitle = this.config.title === '';
    // Community-Edition: Jahr und Inhalte stehen fest.
    const ownContent = !COMMUNITY_CALENDAR;
    return [
      { name: 'title', selector: { text: {} }, disabled: hideTitle },
      { name: 'hide_title', selector: { boolean: {} } },
      ...(ownContent
        ? [{ name: 'year', selector: { number: { min: 2000, max: 2100, mode: 'box' } } }]
        : []),
      { name: 'theme', selector: { select: { mode: 'dropdown', options: THEME_OPTIONS } } },
      { name: 'snow', selector: { boolean: {} } },
      { name: 'shuffle', selector: { boolean: {} } },
      { name: 'empty_text', selector: { text: { multiline: true } } },
      ...(ownContent
        ? [{ name: 'content_source', selector: { select: { mode: 'dropdown', options: SOURCE_OPTIONS } } }]
        : []),
      ...(ownContent && this.config.content_source === 'json'
        ? [{ name: 'json_path', selector: { text: {} } }]
        : []),
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
    this.applySource(next, value.content_source);
    this.applyPath(next, value.json_path);
    if (this.isAdmin) {
      setOrDelete(next, 'debug_date', value.debug_date || undefined);
    }
    fireConfigChanged(this, next);
  }

  /** JSON nur, wenn keine Person „fallback“ oder „shared“ heißt – die Namen gehören den Dateien. */
  private applySource(next: AdventCalendarCardConfig, source: ContentSource | undefined): void {
    this.sourceError = undefined;
    if (source !== 'json') {
      setOrDelete(next, 'content_source', undefined);
      return;
    }
    const reserved = Object.keys(next.users ?? {}).find(isReservedName);
    if (reserved) {
      this.sourceError = `Benenne zuerst die Person „${reserved}“ um: Mit JSON-Dateien gehören die Namen „${FALLBACK_FILE}“ und „${SHARED_FILE}“ dem Fallback und den gemeinsamen Türchen.`;
      return;
    }
    next.content_source = 'json';
  }

  /** Ungültige Pfade bleiben nur als Entwurf im Feld stehen; der Standardpfad fällt weg. */
  private applyPath(next: AdventCalendarCardConfig, value: string | undefined): void {
    const path = value?.trim() ?? '';
    if (!path || path === DEFAULT_JSON_PATH) {
      this.pathDraft = undefined;
      setOrDelete(next, 'json_path', undefined);
      return;
    }
    const error = jsonPathError(path);
    if (error) {
      this.pathDraft = { value: value ?? '', error };
      return;
    }
    this.pathDraft = undefined;
    next.json_path = path;
  }

  render() {
    const community = COMMUNITY_CALENDAR;
    return html`
      <div class="section">
        ${community
          ? html`<p class="intro community">
              Community-Edition ${community.year}: Alle sehen denselben Kalender. Eigene
              Kalender mit eigenen Türchen kommen ${community.year + 1}.
            </p>`
          : nothing}
        <ha-form
          .hass=${this.hass}
          .data=${this.data}
          .schema=${this.schema}
          .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
          .computeHelper=${(field: FormField) => HELPERS[field.name]}
          @value-changed=${this.onValueChanged}
        ></ha-form>
        ${this.sourceError ? html`<p class="error-text source-error">${this.sourceError}</p>` : nothing}
        ${this.pathDraft ? html`<p class="error-text path-error">${this.pathDraft.error}</p>` : nothing}
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
