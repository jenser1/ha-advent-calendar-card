import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { normalizeEffects, runEffects, sharedEffectNotice } from '../blocks/effect';
import { SHARED_FILE, contentFile, doorsOf, usesJson, type ContentFile } from '../content-source';
import { DEFAULT_EMPTY_TEXT } from '../door-dialog';
import '../door-dialog';
import type {
  AdventCalendarCardConfig,
  HomeAssistant,
  SharedConfig,
  SharedDoorContent,
  SharedMode,
} from '../types';
import './door-editor';
import './door-grid';
import {
  ContentFileController,
  editorYear,
  fileStyles,
  renderFileBox,
  renderFileDoor,
} from './file-doors';
import {
  SHARED_MODE_LABELS,
  SHARED_MODE_OPTIONS,
  editorStyles,
  fireConfigChanged,
  setOrDelete,
  type FormField,
} from './shared';

const DEFAULT_MODE: SharedMode = 'merge';

interface SettingsData {
  mode: SharedMode;
  effect_once: boolean;
  effect_helper?: string;
}

const LABELS: Record<string, string> = {
  mode: 'Modus für gemeinsame Türchen',
  effect_once: 'Gemeinsamen Effekt nur einmal pro Tag auslösen',
  effect_helper: 'Merker (Text-Helfer)',
};

const HELPERS: Record<string, string> = {
  mode: 'Gilt für alle gemeinsamen Türchen; einzelne Türchen können einen eigenen Modus haben.',
  effect_helper:
    'Darin merkt sich die Karte, dass der Effekt heute schon lief. Anlegen unter Einstellungen → Geräte & Dienste → Helfer → Text.',
};

/**
 * Tab „Gemeinsam“: Modus, „einmal pro Tag“ mit Helfer und die gemeinsamen Türchen –
 * mit demselben Raster und Baustein-Editor wie im Tab „Türchen“. Mit content_source: json
 * kommen die Türchen aus der Datei und werden nur angezeigt.
 */
export class AdventCalendarEditorShared extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config!: AdventCalendarCardConfig;

  @state() private day = 1;
  @state() private previewOpen = false;
  @state() private effectMessage?: string;

  private files = new ContentFileController(this);

  static styles = [
    editorStyles,
    fileStyles,
    css`
      h3 {
        margin: 8px 0 0;
        font-size: 1.1em;
        font-weight: 500;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .notice {
        margin: 0;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--secondary-background-color, #f2f2f2);
        font-size: 0.9em;
      }
    `,
  ];

  private get shared(): SharedConfig {
    return this.config.shared ?? {};
  }

  private get sharedFile(): ContentFile {
    return contentFile(this.config, SHARED_FILE, editorYear(this.config, this.hass));
  }

  /** Gemeinsame Türchen – aus der YAML oder im JSON-Modus aus der Datei. */
  private get doors(): SharedConfig['doors'] {
    return usesJson(this.config)
      ? doorsOf(this.files.get(this.sharedFile, true))
      : this.shared.doors;
  }

  /** Schreibt shared zurück; ohne Inhalt und mit Standardwerten fällt es ganz weg. */
  private emit(shared: SharedConfig): void {
    const next: AdventCalendarCardConfig = { ...this.config };
    setOrDelete(next, 'shared', Object.keys(shared).length > 0 ? shared : undefined);
    fireConfigChanged(this, next);
  }

  private get settingsSchema(): FormField[] {
    const once = this.shared.effect_once !== false;
    return [
      { name: 'mode', selector: { select: { mode: 'dropdown', options: SHARED_MODE_OPTIONS } } },
      { name: 'effect_once', selector: { boolean: {} } },
      ...(once ? [{ name: 'effect_helper', selector: { entity: { domain: 'input_text' } } }] : []),
    ];
  }

  private onSettingsChanged(event: CustomEvent<{ value: SettingsData }>): void {
    event.stopPropagation();
    const value = event.detail.value;
    const shared: SharedConfig = { ...this.shared };
    setOrDelete(shared, 'mode', value.mode && value.mode !== DEFAULT_MODE ? value.mode : undefined);
    setOrDelete(shared, 'effect_once', value.effect_once === false ? false : undefined);
    setOrDelete(shared, 'effect_helper', value.effect_helper || undefined);
    this.emit(shared);
  }

  private onContentChanged(event: CustomEvent<{ content: SharedDoorContent | null }>): void {
    const shared: SharedConfig = { ...this.shared };
    const doors = { ...(shared.doors ?? {}) };
    if (event.detail.content) {
      doors[this.day] = event.detail.content;
    } else {
      delete doors[this.day];
    }
    setOrDelete(shared, 'doors', Object.keys(doors).length > 0 ? doors : undefined);
    this.emit(shared);
  }

  /** Entfernt die (im JSON-Modus ignorierten) gemeinsamen Türchen aus der YAML. */
  private removeYamlDoors(): void {
    const { doors: _doors, ...shared } = this.shared;
    this.emit(shared);
  }

  private async triggerEffect(effect: SharedDoorContent['effect']): Promise<void> {
    if (!this.hass) {
      return;
    }
    const errors = await runEffects(this.hass, effect, { tag: this.day, person: 'gemeinsam' });
    this.effectMessage =
      errors.length > 0 ? `Effekt nicht möglich: ${errors.join(' · ')}` : '✨ Effekt ausgelöst.';
  }

  private renderFileDoors(door: SharedDoorContent | null) {
    const file = this.sharedFile;
    return html`
      <p class="intro">
        Die gemeinsamen Türchen kommen aus einer Datei (Inhaltsquelle JSON). Ändern kannst du
        sie nur dort, danach hier „Neu laden“. Ein eigener Modus pro Türchen steht als „mode“
        im Türchen.
      </p>
      ${renderFileBox(file, this.files.get(file, true), {
        missingText: 'Keine Datei – damit gibt es keine gemeinsamen Türchen.',
        onReload: () => this.files.reload(file, true),
      })}
      <advent-calendar-editor-door-grid
        .doors=${this.doors}
        .selected=${this.day}
        @door-selected=${this.onDoorSelected}
      ></advent-calendar-editor-door-grid>

      <h3>Türchen ${this.day}</h3>
      ${renderFileDoor(this.day, door)}
    `;
  }

  private renderYamlDoors(door: SharedDoorContent | null, mode: SharedMode) {
    return html`
      <advent-calendar-editor-door-grid
        .doors=${this.shared.doors}
        .selected=${this.day}
        @door-selected=${this.onDoorSelected}
      ></advent-calendar-editor-door-grid>

      <h3>Türchen ${this.day}</h3>
      <advent-calendar-editor-door
        .hass=${this.hass}
        .day=${this.day}
        .content=${door}
        .allowMode=${true}
        .defaultModeLabel=${SHARED_MODE_LABELS[mode]}
        @content-changed=${this.onContentChanged}
      ></advent-calendar-editor-door>
    `;
  }

  private onDoorSelected = (event: CustomEvent<{ day: number }>): void => {
    this.day = event.detail.day;
    this.effectMessage = undefined;
  };

  render() {
    const shared = this.shared;
    const json = usesJson(this.config);
    const mode = shared.mode ?? DEFAULT_MODE;
    const doors = this.doors;
    const door = doors?.[this.day] ?? null;
    const { mode: _mode, ...preview } = door ?? {};
    const notice = sharedEffectNotice({ ...shared, doors }, this.hass?.states);
    const data: SettingsData = {
      mode,
      effect_once: shared.effect_once !== false,
      effect_helper: shared.effect_helper ?? '',
    };

    return html`
      <div class="section">
        <p class="intro">
          Gemeinsame Türchen sehen alle Personen – zusätzlich zum eigenen Inhalt oder stattdessen.
          Ob ein Türchen geöffnet ist, bleibt pro Person getrennt.
        </p>
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this.settingsSchema}
          .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
          .computeHelper=${(field: FormField) => HELPERS[field.name]}
          @value-changed=${this.onSettingsChanged}
        ></ha-form>
        ${notice ? html`<p class="notice">${notice}</p>` : nothing}

        <h3>Gemeinsame Türchen</h3>
        ${json ? this.renderFileDoors(door) : this.renderYamlDoors(door, mode)}

        <div class="actions">
          <button class="button preview" @click=${() => (this.previewOpen = true)}>
            👀 Türchen ${this.day} testen
          </button>
          ${normalizeEffects(door?.effect).length > 0
            ? html`<button class="button trigger-effect" @click=${() => this.triggerEffect(door?.effect)}>
                ✨ Effekt auslösen
              </button>`
            : nothing}
        </div>
        <p class="hint">
          Zeigt nur den gemeinsamen Teil. Wie es zusammen mit dem eigenen Inhalt einer Person
          aussieht, testest du im Tab „Türchen“.
        </p>
        ${this.effectMessage ? html`<p class="hint effect-message">${this.effectMessage}</p>` : nothing}
        <advent-calendar-editor-json-export
          .doors=${shared.doors}
          .file=${this.sharedFile}
          .json=${json}
          @remove-yaml-doors=${this.removeYamlDoors}
        ></advent-calendar-editor-json-export>
      </div>

      <advent-calendar-dialog
        .open=${this.previewOpen}
        .day=${this.day}
        .sharedContent=${door ? preview : null}
        .emptyText=${this.config.empty_text ?? DEFAULT_EMPTY_TEXT}
        @dialog-closed=${() => (this.previewOpen = false)}
        @task-toggle=${(event: Event) => event.stopPropagation()}
      ></advent-calendar-dialog>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-shared')) {
  customElements.define('advent-calendar-editor-shared', AdventCalendarEditorShared);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-shared': AdventCalendarEditorShared;
  }
}
