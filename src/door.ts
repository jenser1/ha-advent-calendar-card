import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';

export const DOOR_TAG = 'advent-calendar-door';

/** Ein einzelnes Türchen im Kalender. */
export class AdventCalendarDoor extends LitElement {
  @property({ type: Number }) day = 0;

  static styles = css`
    :host {
      display: block;
    }

    .door {
      container-type: inline-size;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: linear-gradient(
        145deg,
        var(--secondary-background-color, #f2f2f2),
        var(--card-background-color, #fff)
      );
      user-select: none;
    }

    .number {
      font-size: 40cqi;
      font-weight: 700;
      line-height: 1;
      color: var(--primary-color, #b71c1c);
    }
  `;

  render() {
    return html`
      <div class="door" role="img" aria-label="Türchen ${this.day}">
        <span class="number">${this.day}</span>
      </div>
    `;
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
