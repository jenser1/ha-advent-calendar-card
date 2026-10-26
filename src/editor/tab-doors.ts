import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { normalizeEffects, runEffects } from '../blocks/effect';
import { DEFAULT_EMPTY_TEXT } from '../door-dialog';
import '../door-dialog';
import { resolveDoor } from '../persons';
import type {
  AdventCalendarCardConfig,
  CalendarConfig,
  DoorContent,
  HomeAssistant,
  PersonConfig,
} from '../types';
import './door-editor';
import './door-grid';
import { editorStyles, fireConfigChanged, setOrDelete } from './shared';

/** Auswahlwert für den Fallback-Kalender (kein gültiger Personen-Name in der Auswahl). */
export const FALLBACK_CALENDAR = '__fallback__';

type Doors = Record<number, DoorContent | null>;

/** Setzt oder entfernt ein Türchen; ein leeres doors-Objekt fällt ganz weg. */
function withDoor(doors: Doors | null | undefined, day: number, content: DoorContent | null): Doors | undefined {
  const next: Doors = { ...(doors ?? {}) };
  if (content) {
    next[day] = content;
  } else {
    delete next[day];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Tab „Türchen“: Kalender (Person oder Fallback) wählen, Türchen im Raster anklicken,
 * Bausteine bearbeiten, Türchen testen – ohne etwas zu speichern.
 */
export class AdventCalendarEditorDoors extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config!: AdventCalendarCardConfig;

  @state() private calendar?: string;
  @state() private day = 1;
  @state() private previewOpen = false;
  @state() private effectMessage?: string;

  static styles = [
    editorStyles,
    css`
      .calendars {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .chip {
        font: inherit;
        padding: 4px 12px;
        border-radius: 16px;
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        background: transparent;
        color: var(--primary-text-color);
        cursor: pointer;
      }

      .chip[aria-pressed='true'] {
        border-color: var(--primary-color, #03a9f4);
        background: var(--primary-color, #03a9f4);
        color: var(--text-primary-color, #fff);
      }

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
    `,
  ];

  /** Wählbare Kalender: alle Personen, dazu der Fallback (ohne Personen: „Für alle“). */
  private get calendars(): { id: string; label: string }[] {
    const persons = Object.keys(this.config.users ?? {}).map((key) => ({ id: key, label: key }));
    if (persons.length === 0) {
      return [{ id: FALLBACK_CALENDAR, label: 'Kalender für alle' }];
    }
    return this.config.fallback
      ? [...persons, { id: FALLBACK_CALENDAR, label: 'Fallback' }]
      : persons;
  }

  /** Gewählter Kalender; nach Umbenennen oder Löschen der erste verfügbare. */
  private get currentCalendar(): string {
    const ids = this.calendars.map((calendar) => calendar.id);
    return this.calendar && ids.includes(this.calendar) ? this.calendar : ids[0];
  }

  private calendarConfig(id: string): CalendarConfig {
    return (id === FALLBACK_CALENDAR ? this.config.fallback : this.config.users?.[id]) ?? {};
  }

  private onContentChanged(event: CustomEvent<{ content: DoorContent | null }>): void {
    const id = this.currentCalendar;
    const next: AdventCalendarCardConfig = { ...this.config };
    const calendar: CalendarConfig = { ...this.calendarConfig(id) };
    setOrDelete(calendar, 'doors', withDoor(calendar.doors, this.day, event.detail.content));
    if (id === FALLBACK_CALENDAR) {
      // Ohne Personen ist der Fallback der Kalender für alle; er entsteht beim ersten Türchen.
      next.fallback = calendar;
    } else {
      next.users = { ...this.config.users, [id]: calendar as PersonConfig };
    }
    fireConfigChanged(this, next);
  }

  private async triggerEffect(): Promise<void> {
    const hass = this.hass;
    if (!hass) {
      return;
    }
    const id = this.currentCalendar;
    const door = resolveDoor(this.config, this.calendarConfig(id), this.day);
    const variables = { tag: this.day, person: id === FALLBACK_CALENDAR ? 'fallback' : id };
    const errors = (
      await Promise.all([
        runEffects(hass, door.personal?.effect, variables),
        runEffects(hass, door.shared?.effect, variables),
      ])
    ).flat();
    this.effectMessage =
      errors.length > 0 ? `Effekt nicht möglich: ${errors.join(' · ')}` : '✨ Effekt ausgelöst.';
  }

  render() {
    const id = this.currentCalendar;
    const calendar = this.calendarConfig(id);
    const content = calendar.doors?.[this.day] ?? null;
    const door = resolveDoor(this.config, calendar, this.day);
    const hasEffect =
      normalizeEffects(door.personal?.effect).length + normalizeEffects(door.shared?.effect).length > 0;

    return html`
      <div class="section">
        ${this.calendars.length > 1 || Object.keys(this.config.users ?? {}).length > 0
          ? html`
              <div class="calendars" role="group" aria-label="Kalender">
                ${this.calendars.map(
                  (calendarOption) => html`
                    <button
                      class="chip"
                      aria-pressed=${calendarOption.id === id ? 'true' : 'false'}
                      @click=${() => {
                        this.calendar = calendarOption.id;
                        this.effectMessage = undefined;
                      }}
                    >
                      ${calendarOption.label}
                    </button>
                  `,
                )}
              </div>
            `
          : html`<p class="intro">
              Ohne Personen sehen alle denselben Kalender. Personen legst du im Tab „Personen“ an.
            </p>`}

        <advent-calendar-editor-door-grid
          .doors=${calendar.doors}
          .selected=${this.day}
          @door-selected=${(event: CustomEvent<{ day: number }>) => {
            this.day = event.detail.day;
            this.effectMessage = undefined;
          }}
        ></advent-calendar-editor-door-grid>

        <h3>Türchen ${this.day}</h3>
        <advent-calendar-editor-door
          .hass=${this.hass}
          .day=${this.day}
          .content=${content}
          @content-changed=${this.onContentChanged}
        ></advent-calendar-editor-door>

        <div class="actions">
          <button class="button preview" @click=${() => (this.previewOpen = true)}>
            👀 Türchen ${this.day} testen
          </button>
          ${hasEffect
            ? html`<button class="button trigger-effect" @click=${this.triggerEffect}>
                ✨ Effekt auslösen
              </button>`
            : nothing}
        </div>
        <p class="hint">
          Zeigt den Inhalt so, wie ihn die Person sieht – ohne etwas zu speichern. Effekte laufen
          nur über „Effekt auslösen“.
        </p>
        ${this.effectMessage ? html`<p class="hint effect-message">${this.effectMessage}</p>` : nothing}
      </div>

      <advent-calendar-dialog
        .open=${this.previewOpen}
        .day=${this.day}
        .content=${door.personal ?? null}
        .sharedContent=${door.shared ?? null}
        .emptyText=${this.config.empty_text ?? DEFAULT_EMPTY_TEXT}
        @dialog-closed=${() => (this.previewOpen = false)}
        @task-toggle=${(event: Event) => event.stopPropagation()}
      ></advent-calendar-dialog>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-doors')) {
  customElements.define('advent-calendar-editor-doors', AdventCalendarEditorDoors);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-doors': AdventCalendarEditorDoors;
  }
}
