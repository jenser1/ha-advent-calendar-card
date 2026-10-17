import { LitElement, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { version } from '../package.json';
import {
  DOOR_COUNT,
  daysUntilDoor,
  effectiveToday,
  formatGermanDate,
  getDoorStatus,
  isSameDate,
  isSeasonOver,
  parseDebugDate,
  type DoorStatus,
  type EffectiveToday,
} from './date-logic';
import './door';
import {
  isOpened,
  loadState,
  markOpened,
  openedCount,
  resetState,
  storageKey,
  type CalendarState,
} from './storage';
import type { AdventCalendarCardConfig, HomeAssistant } from './types';

export const CARD_TAG = 'advent-calendar-card';

// So oft wird geprüft, ob ein neuer Tag begonnen hat (z. B. Wandtablet über Mitternacht).
const DAY_CHECK_INTERVAL_MS = 60_000;

export class AdventCalendarCard extends LitElement {
  @state() private config?: AdventCalendarCardConfig;
  @state() private today?: EffectiveToday;
  /** Gespeicherter Stand; undefined, solange er nicht geladen ist. */
  @state() private calendar?: CalendarState;
  @state() private loadFailed = false;

  private _hass?: HomeAssistant;
  private dayTimer?: number;
  /** Benutzer und Schlüssel, zu denen `calendar` gehört. */
  private calendarId?: string;
  private loadRequest = 0;
  private wasConnected = false;

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // Bewusst nicht reaktiv: HA setzt hass bei jeder Zustandsänderung neu.
  // Neu berechnet wird nur, wenn sich Benutzer, Zeitzone oder Admin-Status ändern.
  set hass(hass: HomeAssistant | undefined) {
    const previous = this._hass;
    this._hass = hass;
    if (
      previous?.user?.id !== hass?.user?.id ||
      previous?.user?.is_admin !== hass?.user?.is_admin ||
      previous?.config.time_zone !== hass?.config.time_zone
    ) {
      this.refresh();
    }
  }

  static getStubConfig(): Omit<AdventCalendarCardConfig, 'type'> {
    return { title: 'Adventskalender' };
  }

  setConfig(config: AdventCalendarCardConfig): void {
    if (!config) {
      throw new Error('Ungültige Konfiguration.');
    }
    const { year, debug_date: debugDate } = config;
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      throw new Error('„year“ muss eine Jahreszahl sein, z. B. 2026.');
    }
    if (debugDate != null && debugDate !== '' && !parseDebugDate(debugDate)) {
      throw new Error('„debug_date“ muss ein Datum im Format JJJJ-MM-TT sein, z. B. 2026-12-05.');
    }
    this.config = config;
    this.refresh();
  }

  getCardSize(): number {
    return 8;
  }

  // Layout im Abschnitte-Dashboard: standardmäßig volle Breite.
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Beim Zurückkehren auf die Ansicht frisch laden: Auf einem anderen Gerät
    // könnte inzwischen ein Türchen geöffnet worden sein.
    this.refresh({ reload: this.wasConnected });
    this.wasConnected = true;
    this.dayTimer = window.setInterval(() => this.refresh(), DAY_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.dayTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.refresh({ reload: true });
    }
  };

  /** Bestimmt „heute“ neu und lädt bei Bedarf den passenden Speicherstand. */
  private refresh({ reload = false } = {}): void {
    this.refreshToday();
    void this.loadCalendar(reload);
  }

  private refreshToday(): void {
    const next = effectiveToday({
      now: new Date(),
      timeZone: this._hass?.config.time_zone,
      debugDate: this.config?.debug_date,
      isAdmin: this._hass?.user?.is_admin === true,
    });
    const current = this.today;
    if (!current || current.debug !== next.debug || !isSameDate(current.date, next.date)) {
      this.today = next;
    }
  }

  private get year(): number | undefined {
    return this.today && (this.config?.year ?? this.today.date.year);
  }

  private get storageKey(): string | undefined {
    const year = this.year;
    return year === undefined ? undefined : storageKey(year, this.today!.debug);
  }

  /** Kennung aus Benutzer und Schlüssel; ändert sie sich, gehört der geladene Stand nicht mehr dazu. */
  private get currentCalendarId(): string | undefined {
    const userId = this._hass?.user?.id;
    const key = this.storageKey;
    return userId && key ? `${userId}/${key}` : undefined;
  }

  private async loadCalendar(reload: boolean): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    const id = this.currentCalendarId;
    // Nach einem Fehler wird bei jedem Aufruf (spätestens minütlich) erneut geladen.
    if (!hass || !key || !id || (!reload && !this.loadFailed && id === this.calendarId)) {
      return;
    }
    if (id !== this.calendarId) {
      // Anderer Benutzer oder anderes Jahr: alten Stand nicht weiter anzeigen.
      this.calendar = undefined;
      this.calendarId = id;
    }
    const request = ++this.loadRequest;
    try {
      const calendar = await loadState(hass, key);
      if (request === this.loadRequest) {
        this.calendar = calendar;
        this.loadFailed = false;
      }
    } catch (err) {
      if (request === this.loadRequest) {
        console.error('[advent-calendar-card] Laden fehlgeschlagen:', err);
        this.loadFailed = true;
      }
    }
  }

  private onDoorClick(day: number, status: DoorStatus | undefined, daysLeft: number): void {
    if (status === 'locked') {
      this.toast(daysLeft === 1 ? 'Noch 1 Tag!' : `Noch ${daysLeft} Tage!`);
    } else if (status === 'openable') {
      void this.openDoor(day);
    }
  }

  private async openDoor(day: number): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    const id = this.currentCalendarId;
    const before = this.calendar;
    if (!hass || !key || !before) {
      return;
    }
    // Sofort anzeigen, Speichern läuft im Hintergrund.
    this.calendar = { opened: { ...before.opened, [day]: new Date().toISOString() } };
    try {
      const { state } = await markOpened(hass, key, day, new Date());
      if (id === this.currentCalendarId) {
        this.calendar = state;
      }
    } catch (err) {
      console.error('[advent-calendar-card] Speichern fehlgeschlagen:', err);
      if (id === this.currentCalendarId) {
        this.calendar = before;
      }
      this.toast('Türchen konnte nicht gespeichert werden. Bitte nochmal versuchen.');
    }
  }

  private async resetTestData(): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    if (!hass || !key || !this.today?.debug) {
      return;
    }
    try {
      this.calendar = await resetState(hass, key);
      this.toast('Testdaten zurückgesetzt.');
    } catch (err) {
      console.error('[advent-calendar-card] Zurücksetzen fehlgeschlagen:', err);
      this.toast('Testdaten konnten nicht zurückgesetzt werden.');
    }
  }

  private toast(message: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const year = this.year;
    if (!this.config || !this.today || year === undefined) {
      return nothing;
    }
    const { date: today, debug } = this.today;
    const calendar = this.calendar;
    const title = this.config.title ?? `Adventskalender ${year}`;
    const days = Array.from({ length: DOOR_COUNT }, (_, i) => i + 1);

    return html`
      <ha-card>
        ${title ? html`<h1 class="card-header">${title}</h1>` : nothing}
        ${debug
          ? html`
              <div class="debug">
                <span>
                  🧪 Testmodus: heute ist der ${formatGermanDate(today)}.
                  Geöffnete Türchen werden getrennt gespeichert.
                </span>
                <button class="reset" @click=${this.resetTestData}>Testdaten zurücksetzen</button>
              </div>
            `
          : nothing}
        ${this.loadFailed
          ? html`<div class="error">Gespeicherter Stand konnte nicht geladen werden.</div>`
          : nothing}
        <div class="doors">
          ${days.map((day) => {
            const status = calendar
              ? getDoorStatus(day, year, today, isOpened(calendar, day))
              : undefined;
            return html`
              <advent-calendar-door
                .day=${day}
                .status=${status}
                @click=${() => this.onDoorClick(day, status, daysUntilDoor(day, year, today))}
              ></advent-calendar-door>
            `;
          })}
        </div>
        ${calendar && isSeasonOver(year, today)
          ? html`<div class="stats">${openedCount(calendar)}/${DOOR_COUNT} geöffnet</div>`
          : nothing}
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      container-type: inline-size;
    }

    .debug,
    .error {
      margin: 0 16px 12px;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.9em;
    }

    .debug {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
      background: var(--warning-color, #ffa600);
      color: #000;
    }

    .debug span {
      flex: 1 1 200px;
    }

    .reset {
      font: inherit;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.4);
      background: rgba(255, 255, 255, 0.6);
      color: inherit;
      cursor: pointer;
    }

    .error {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .debug:first-child,
    .error:first-child {
      margin-top: 16px;
    }

    .doors {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 16px;
    }

    .card-header + .doors,
    .debug + .doors,
    .error + .doors {
      padding-top: 0;
    }

    .stats {
      padding: 0 16px 16px;
      text-align: center;
      color: var(--secondary-text-color);
    }

    @container (min-width: 480px) {
      .doors {
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
      }
    }
  `;
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, AdventCalendarCard);

  window.customCards = window.customCards ?? [];
  window.customCards.push({
    type: CARD_TAG,
    name: 'Adventskalender',
    description: 'Ein eigener Adventskalender für jede Person im Haushalt.',
    preview: true,
    documentationURL: 'https://github.com/jenser1/ha-advent-calendar-card',
  });

  console.info(
    `%c ADVENT-CALENDAR-CARD %c v${version} `,
    'color: #fff; background: #b71c1c; font-weight: 700;',
    'color: #b71c1c; background: #fff; font-weight: 700;',
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-card': AdventCalendarCard;
  }
}
