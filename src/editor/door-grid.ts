import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { DOOR_COUNT } from '../date-logic';
import type { DoorContent } from '../types';
import { BLOCK_INFO, blocksOf } from './door-editor';

/**
 * Raster 1–24 zum Auswählen eines Türchens. Gefüllte Türchen zeigen kleine Symbole
 * ihrer Bausteine. Event: `door-selected` (detail: { day }).
 */
export class AdventCalendarEditorDoorGrid extends LitElement {
  @property({ attribute: false }) doors?: Record<number, DoorContent | null> | null;
  @property({ type: Number }) selected?: number;

  static styles = css`
    .grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
    }

    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 48px;
      padding: 4px 2px;
      font: inherit;
      border-radius: 8px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      cursor: pointer;
    }

    .cell.filled {
      background: var(--secondary-background-color, #f2f2f2);
    }

    .cell[aria-pressed='true'] {
      border: 2px solid var(--primary-color, #03a9f4);
    }

    .day {
      font-weight: 600;
    }

    .icons {
      font-size: 10px;
      line-height: 1;
      min-height: 10px;
    }
  `;

  render() {
    const days = Array.from({ length: DOOR_COUNT }, (_, i) => i + 1);
    return html`
      <div class="grid">
        ${days.map((day) => {
          const blocks = blocksOf(this.doors?.[day]);
          const label = blocks.map((block) => BLOCK_INFO[block].label).join(', ');
          return html`
            <button
              class="cell ${blocks.length > 0 ? 'filled' : ''}"
              aria-pressed=${this.selected === day ? 'true' : 'false'}
              title=${label ? `Türchen ${day}: ${label}` : `Türchen ${day}: leer`}
              @click=${() =>
                this.dispatchEvent(new CustomEvent('door-selected', { detail: { day } }))}
            >
              <span class="day">${day}</span>
              <span class="icons">${blocks.map((block) => BLOCK_INFO[block].icon).join('')}</span>
            </button>
          `;
        })}
      </div>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-door-grid')) {
  customElements.define('advent-calendar-editor-door-grid', AdventCalendarEditorDoorGrid);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-door-grid': AdventCalendarEditorDoorGrid;
  }
}
