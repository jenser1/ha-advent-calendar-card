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
import type { AdventCalendarCardConfig, HomeAssistant } from './types';

export const CARD_TAG = 'advent-calendar-card';

// So oft wird geprüft, ob ein neuer Tag begonnen hat (z. B. Wandtablet über Mitternacht).
const DAY_CHECK_INTERVAL_MS = 60_000;

export class AdventCalendarCard extends LitElement {
  @state() private config?: AdventCalendarCardConfig;
  @state() private today?: EffectiveToday;
  // Wird noch nicht gespeichert, geht also beim Neuladen verloren.
  @state() private opened: ReadonlySet<number> = new Set();

  private _hass?: HomeAssistant;
  private dayTimer?: number;

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // Bewusst nicht reaktiv: HA setzt hass bei jeder Zustandsänderung neu.
  // Neu berechnet wird nur, wenn sich Zeitzone oder Admin-Status ändern.
  set hass(hass: HomeAssistant | undefined) {
    const previous = this._hass;
    this._hass = hass;
    if (
      previous?.config.time_zone !== hass?.config.time_zone ||
      previous?.user?.is_admin !== hass?.user?.is_admin
    ) {
      this.refreshToday();
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
    this.refreshToday();
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
    this.refreshToday();
    this.dayTimer = window.setInterval(() => this.refreshToday(), DAY_CHECK_INTERVAL_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.dayTimer);
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

  private onDoorClick(day: number, status: DoorStatus, daysLeft: number): void {
    if (status === 'locked') {
      this.toast(daysLeft === 1 ? 'Noch 1 Tag!' : `Noch ${daysLeft} Tage!`);
    } else if (status === 'openable') {
      this.opened = new Set(this.opened).add(day);
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
    if (!this.config || !this.today) {
      return nothing;
    }
    const { date: today, debug } = this.today;
    const year = this.config.year ?? today.year;
    const title = this.config.title ?? `Adventskalender ${year}`;
    const days = Array.from({ length: DOOR_COUNT }, (_, i) => i + 1);

    return html`
      <ha-card>
        ${title ? html`<h1 class="card-header">${title}</h1>` : nothing}
        ${debug
          ? html`<div class="debug">🧪 Testmodus: heute ist der ${formatGermanDate(today)}</div>`
          : nothing}
        <div class="doors">
          ${days.map((day) => {
            const status = getDoorStatus(day, year, today, this.opened.has(day));
            return html`
              <advent-calendar-door
                .day=${day}
                .status=${status}
                @click=${() => this.onDoorClick(day, status, daysUntilDoor(day, year, today))}
              ></advent-calendar-door>
            `;
          })}
        </div>
        ${isSeasonOver(year, today)
          ? html`<div class="stats">${this.opened.size}/${DOOR_COUNT} geöffnet</div>`
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

    .debug {
      margin: 0 16px 12px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--warning-color, #ffa600);
      color: #000;
      font-size: 0.9em;
    }

    .debug:first-child {
      margin-top: 16px;
    }

    .doors {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 16px;
    }

    .card-header + .doors,
    .debug + .doors {
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
