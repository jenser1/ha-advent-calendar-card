import { LitElement, css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import type { DoorStatus } from './date-logic';

export const DOOR_TAG = 'advent-calendar-door';

const STATUS_LABELS: Record<DoorStatus, string> = {
  locked: 'noch gesperrt',
  openable: 'heute öffenbar',
  opened: 'geöffnet',
  missed: 'verpasst',
};

/** Ein einzelnes Türchen im Kalender. */
export class AdventCalendarDoor extends LitElement {
  @property({ type: Number }) day = 0;
  @property() status: DoorStatus = 'locked';

  static styles = css`
    :host {
      display: block;
    }

    .door {
      container-type: inline-size;
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: linear-gradient(
        145deg,
        var(--secondary-background-color, #f2f2f2),
        var(--card-background-color, #fff)
      );
      color: var(--primary-color, #b71c1c);
      font: inherit;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .door:focus-visible {
      outline: 2px solid var(--primary-color, #b71c1c);
      outline-offset: 2px;
    }

    .number {
      font-size: 40cqi;
      font-weight: 700;
      line-height: 1;
    }

    .badge {
      position: absolute;
      top: 6%;
      right: 8%;
      font-size: 16cqi;
      line-height: 1;
    }

    .note {
      position: absolute;
      bottom: 7%;
      left: 0;
      right: 0;
      font-size: 11cqi;
      line-height: 1.1;
      text-align: center;
      color: var(--secondary-text-color, #727272);
    }

    .locked .badge {
      opacity: 0.6;
    }

    .openable {
      border: 2px solid var(--primary-color, #b71c1c);
      box-shadow: 0 0 12px var(--primary-color, #b71c1c);
    }

    .openable .note {
      color: var(--primary-color, #b71c1c);
      font-weight: 700;
    }

    .opened {
      background: var(--secondary-background-color, #f2f2f2);
      background: color-mix(
        in srgb,
        var(--primary-color, #b71c1c) 18%,
        var(--card-background-color, #fff)
      );
    }

    .missed {
      cursor: default;
      opacity: 0.45;
      filter: grayscale(1);
    }
  `;

  render() {
    return html`
      <button
        class="door ${this.status}"
        aria-label="Türchen ${this.day}, ${STATUS_LABELS[this.status]}"
      >
        <span class="number">${this.day}</span>
        ${this.renderExtra()}
      </button>
    `;
  }

  private renderExtra() {
    switch (this.status) {
      case 'locked':
        return html`<span class="badge" aria-hidden="true">🔒</span>`;
      case 'openable':
        return html`<span class="note" aria-hidden="true">Heute!</span>`;
      case 'opened':
        return html`<span class="badge" aria-hidden="true">✔</span>`;
      case 'missed':
        return html`<span class="note" aria-hidden="true">Verpasst 😢</span>`;
      default:
        return nothing;
    }
  }
}

if (!customElements.get(DOOR_TAG)) {
  customElements.define(DOOR_TAG, AdventCalendarDoor);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-door': AdventCalendarDoor;
  }
}
