import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { isThemeName } from '../themes';
import type { AdventCalendarCardConfig, CalendarConfig, HomeAssistant, PersonConfig } from '../types';
import {
  THEME_OPTIONS,
  editorStyles,
  fireConfigChanged,
  setOrDelete,
  type FormField,
} from './shared';

/** Auswahlwert für „kein eigenes Theme“ (ein leerer Wert ist in HAs Auswahlliste nicht wählbar). */
const CARD_THEME = 'card';
const FALLBACK = '__fallback__';

interface PersonData {
  name: string;
  user_id?: string;
  theme: string;
}

const PERSON_SCHEMA: FormField[] = [
  { name: 'name', selector: { text: {} } },
  { name: 'user_id', selector: { user: {} } },
  {
    name: 'theme',
    selector: {
      select: { mode: 'dropdown', options: [{ value: CARD_THEME, label: 'Wie die Karte' }, ...THEME_OPTIONS] },
    },
  },
];

interface FallbackData {
  enabled: boolean;
  theme?: string;
}

const LABELS: Record<string, string> = {
  name: 'Name',
  user_id: 'HA-Benutzer',
  theme: 'Theme',
  enabled: 'Kalender für alle ohne eigenen Eintrag (Fallback)',
};

const HELPERS: Record<string, string> = {
  name: 'Ohne HA-Benutzer wird über diesen Namen zugeordnet (z. B. „jens“ für den Benutzer „Jens“).',
};

function themeOf(calendar: CalendarConfig | null | undefined): string {
  return calendar?.theme ?? CARD_THEME;
}

/** Tab „Personen“: Personen anlegen, umbenennen, HA-Benutzer und Theme wählen, Fallback an/aus. */
export class AdventCalendarEditorPersons extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config!: AdventCalendarCardConfig;

  /** Name, der gerade getippt wird, aber (noch) nicht gültig ist – je Schlüssel. */
  @state() private nameDrafts: Record<string, { value: string; error: string }> = {};
  /** Eintrag, dessen Löschen gerade bestätigt werden muss. */
  @state() private pendingRemoval?: string;

  static styles = editorStyles;

  private get users(): Record<string, PersonConfig | null> {
    return this.config.users ?? {};
  }

  // fallback bewusst ohne Standardwert: undefined heißt „Fallback entfernen“.
  private emit(
    users: Record<string, PersonConfig | null>,
    fallback: CalendarConfig | null | undefined,
  ): void {
    const next: AdventCalendarCardConfig = { ...this.config };
    setOrDelete(next, 'users', Object.keys(users).length > 0 ? users : undefined);
    setOrDelete(next, 'fallback', fallback ?? undefined);
    fireConfigChanged(this, next);
  }

  private nameError(key: string, name: string): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) {
      return 'Der Name darf nicht leer sein.';
    }
    const taken = Object.keys(this.users).some(
      (other) => other !== key && other.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    return taken ? 'Diesen Namen gibt es schon.' : undefined;
  }

  private onPersonChanged(key: string, event: CustomEvent<{ value: PersonData }>): void {
    event.stopPropagation();
    const value = event.detail.value;
    const person: PersonConfig = { ...(this.users[key] ?? {}) };
    setOrDelete(person, 'user_id', value.user_id || undefined);
    setOrDelete(person, 'theme', isThemeName(value.theme) ? value.theme : undefined);

    // Ungültige Namen (leer, doppelt) bleiben nur als Entwurf im Feld stehen.
    // Nicht trimmen, sonst ließe sich „Anna Maria“ nicht tippen; die Zuordnung ignoriert Leerzeichen am Rand.
    const name = value.name ?? key;
    let newKey = key;
    let draft: { value: string; error: string } | undefined;
    if (name !== key) {
      const error = this.nameError(key, name);
      if (error) {
        draft = { value: name, error };
      } else {
        newKey = name;
      }
    }
    const { [key]: _previous, ...drafts } = this.nameDrafts;
    this.nameDrafts = draft ? { ...drafts, [key]: draft } : drafts;

    // Umbenennen ohne die Reihenfolge der Personen zu ändern.
    const users = Object.fromEntries(
      Object.entries(this.users).map(([k, v]) => (k === key ? [newKey, person] : [k, v])),
    );
    this.emit(users, this.config.fallback);
  }

  private addPerson(): void {
    let key = 'neue_person';
    for (let i = 2; key in this.users; i++) {
      key = `neue_person_${i}`;
    }
    this.emit({ ...this.users, [key]: {} }, this.config.fallback);
  }

  private removePerson(key: string): void {
    const { [key]: _removed, ...users } = this.users;
    this.pendingRemoval = undefined;
    this.emit(users, this.config.fallback);
  }

  private onFallbackChanged(event: CustomEvent<{ value: FallbackData }>): void {
    event.stopPropagation();
    const { enabled, theme } = event.detail.value;
    const current = this.config.fallback;
    if (!enabled) {
      if (Object.keys(current?.doors ?? {}).length > 0) {
        // Türchen des Fallbacks würden verloren gehen – erst nachfragen.
        this.pendingRemoval = FALLBACK;
        this.requestUpdate();
      } else {
        this.emit(this.users, undefined);
      }
      return;
    }
    const fallback: CalendarConfig = { ...(current ?? {}) };
    setOrDelete(fallback, 'theme', isThemeName(theme) ? theme : undefined);
    this.emit(this.users, fallback);
  }

  private duplicateUserIds(): Set<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const person of Object.values(this.users)) {
      const id = person?.user_id;
      if (id) {
        if (seen.has(id)) {
          duplicates.add(id);
        }
        seen.add(id);
      }
    }
    return duplicates;
  }

  private renderRemoval(key: string, label: string, onConfirm: () => void) {
    if (this.pendingRemoval !== key) {
      return html`
        <button class="button small danger" @click=${() => (this.pendingRemoval = key)}>
          Entfernen
        </button>
      `;
    }
    return html`
      <span class="confirm">
        ${label}
        <button class="button small danger" @click=${onConfirm}>Ja, löschen</button>
        <button class="button small" @click=${() => (this.pendingRemoval = undefined)}>Abbrechen</button>
      </span>
    `;
  }

  private renderPerson(key: string, person: PersonConfig | null, duplicates: Set<string>) {
    const draft = this.nameDrafts[key];
    const data: PersonData = {
      name: draft?.value ?? key,
      user_id: person?.user_id ?? '',
      theme: themeOf(person),
    };
    const doorCount = Object.keys(person?.doors ?? {}).length;
    return html`
      <div class="box person">
        <div class="box-header">
          <span>${key}</span>
          ${this.renderRemoval(
            key,
            doorCount > 0 ? `Mit ${doorCount} Türchen löschen?` : 'Wirklich löschen?',
            () => this.removePerson(key),
          )}
        </div>
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${PERSON_SCHEMA}
          .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
          .computeHelper=${(field: FormField) => HELPERS[field.name]}
          @value-changed=${(event: CustomEvent<{ value: PersonData }>) => this.onPersonChanged(key, event)}
        ></ha-form>
        ${draft ? html`<p class="error-text">${draft.error}</p>` : nothing}
        ${person?.user_id && duplicates.has(person.user_id)
          ? html`<p class="error-text">Dieser HA-Benutzer ist mehreren Personen zugeordnet.</p>`
          : nothing}
      </div>
    `;
  }

  render() {
    const entries = Object.entries(this.users);
    const duplicates = this.duplicateUserIds();
    const fallback = this.config.fallback;
    return html`
      <div class="section">
        <p class="intro">
          Jede Person bekommt einen eigenen Kalender. Zugeordnet wird über den HA-Benutzer, sonst
          über den Namen. Ohne Personen sehen alle denselben Kalender.
        </p>
        ${entries.map(([key, person]) => this.renderPerson(key, person, duplicates))}
        <button class="button add-person" @click=${this.addPerson}>＋ Person hinzufügen</button>

        <div class="box fallback">
          <ha-form
            .hass=${this.hass}
            .data=${{ enabled: !!fallback, theme: themeOf(fallback) } satisfies FallbackData}
            .schema=${fallback
              ? [{ name: 'enabled', selector: { boolean: {} } }, PERSON_SCHEMA[2]]
              : [{ name: 'enabled', selector: { boolean: {} } }]}
            .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
            @value-changed=${this.onFallbackChanged}
          ></ha-form>
          <p class="hint">
            ${fallback
              ? 'Z. B. für ein Gäste-Tablet. Die Türchen dafür pflegst du im Tab „Türchen“.'
              : 'Aus: Wer keinen Eintrag hat, sieht „Für dich gibt’s noch keinen Kalender 🎅“.'}
          </p>
          ${this.pendingRemoval === FALLBACK
            ? html`
                <span class="confirm">
                  Fallback mit seinen Türchen löschen?
                  <button class="button small danger" @click=${() => {
                    this.pendingRemoval = undefined;
                    this.emit(this.users, undefined);
                  }}>Ja, löschen</button>
                  <button class="button small" @click=${() => (this.pendingRemoval = undefined)}>Abbrechen</button>
                </span>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-persons')) {
  customElements.define('advent-calendar-editor-persons', AdventCalendarEditorPersons);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-persons': AdventCalendarEditorPersons;
  }
}
