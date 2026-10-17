import { LitElement, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { version } from '../package.json';
import './door';
import type { AdventCalendarCardConfig, HomeAssistant } from './types';

export const CARD_TAG = 'advent-calendar-card';
const DOOR_COUNT = 24;

export class AdventCalendarCard extends LitElement {
  // Bewusst nicht reaktiv: HA setzt hass bei jeder Zustandsänderung neu,
  // ein Neu-Rendern ist dafür nicht nötig.
  hass?: HomeAssistant;

  @state() private config?: AdventCalendarCardConfig;

  static getStubConfig(): Omit<AdventCalendarCardConfig, 'type'> {
    return { title: 'Adventskalender' };
  }

  setConfig(config: AdventCalendarCardConfig): void {
    if (!config) {
      throw new Error('Ungültige Konfiguration.');
    }
    const { year } = config;
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      throw new Error('„year“ muss eine Jahreszahl sein, z. B. 2026.');
    }
    this.config = config;
  }

  getCardSize(): number {
    return 8;
  }

  // Layout im Abschnitte-Dashboard: standardmäßig volle Breite.
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  private get year(): number {
    return this.config?.year ?? new Date().getFullYear();
  }

  render() {
    if (!this.config) {
      return nothing;
    }
    const title = this.config.title ?? `Adventskalender ${this.year}`;
    const days = Array.from({ length: DOOR_COUNT }, (_, i) => i + 1);

    return html`
      <ha-card>
        ${title ? html`<h1 class="card-header">${title}</h1>` : nothing}
        <div class="doors">
          ${days.map((day) => html`<advent-calendar-door .day=${day}></advent-calendar-door>`)}
        </div>
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

    .doors {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 16px;
    }

    .card-header + .doors {
      padding-top: 0;
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
