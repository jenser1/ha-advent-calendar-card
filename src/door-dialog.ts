import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { blockStyles, hasVisibleContent, renderBlocks } from './blocks';
import { parseVideo } from './blocks/video';
import type { DoorContent } from './types';

export const DIALOG_TAG = 'advent-calendar-dialog';

export const DEFAULT_EMPTY_TEXT = 'Heute ist das Türchen leer – schön, dass du da bist! 🎄';

/**
 * Modal mit dem Inhalt eines Türchens. Nutzt das native <dialog>-Element statt
 * HA-interner Komponenten, damit es über HA-Versionen hinweg stabil bleibt.
 *
 * Events: `advent-dialog-close`, `task-toggle` (detail: { day, done, shared }).
 */
type Section = 'shared' | 'personal';

export class AdventCalendarDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Number }) day = 0;
  /** Persönlicher Inhalt. */
  @property({ attribute: false }) content?: DoorContent | null;
  /** Gemeinsamer Inhalt (shared). */
  @property({ attribute: false }) sharedContent?: DoorContent | null;
  @property({ attribute: false }) emptyText = DEFAULT_EMPTY_TEXT;
  @property({ type: Boolean }) taskDone = false;
  @property({ type: Boolean }) sharedTaskDone = false;
  /** 1–4 am Adventssonntag: so viele Kerzen erscheinen neben dem Video. */
  @property({ type: Number }) advent?: number;

  /** Abschnitte, deren Rätsel-Lösung schon aufgedeckt ist. */
  @state() private revealed: ReadonlySet<Section> = new Set();

  @query('dialog') private dialog?: HTMLDialogElement;

  static styles = [
    css`
      dialog {
        width: min(92vw, 520px);
        max-height: 85vh;
        box-sizing: border-box;
        padding: 0;
        border: none;
        border-radius: 16px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #212121);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
      }

      dialog::backdrop {
        background: rgba(0, 0, 0, 0.55);
      }

      .inner {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 20px 24px;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      h2 {
        margin: 0;
        font-size: 1.4em;
        font-weight: 500;
      }

      .close {
        flex: none;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        font-size: 1.3em;
        cursor: pointer;
      }

      .close:hover,
      .close:focus-visible {
        background: var(--secondary-background-color, #f2f2f2);
      }

      .section {
        margin: 4px 0 -6px;
        font-size: 0.85em;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--secondary-text-color, #727272);
      }

      .empty {
        margin: 0;
        font-size: 1.1em;
        line-height: 1.5;
      }

      .candles {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 56px;
        text-align: center;
      }

      .candles .flames {
        display: flex;
        flex-direction: column;
        font-size: 1.5em;
        line-height: 1.15;
      }

      .candles .flame {
        display: inline-block;
        animation: flicker 2.4s ease-in-out infinite;
        transform-origin: 50% 90%;
      }

      .candles .flame:nth-child(2) {
        animation-delay: -0.6s;
      }

      .candles .flame:nth-child(3) {
        animation-delay: -1.2s;
      }

      .candles .flame:nth-child(4) {
        animation-delay: -1.8s;
      }

      .candles .label {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--secondary-text-color, #727272);
        white-space: nowrap;
      }

      /* Ohne Video: Kerzen als Zeile unter der Überschrift. */
      .candles.row,
      .candles.row .flames {
        flex-direction: row;
        justify-content: center;
      }

      @keyframes flicker {
        0%,
        100% {
          transform: rotate(-2deg) scale(1);
        }
        50% {
          transform: rotate(2deg) scale(1.04);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .candles .flame {
          animation: none;
        }
      }

      /* Schmale Bildschirme: Kerzen als Zeile über dem Video. */
      @media (max-width: 420px) {
        .video-row {
          flex-direction: column-reverse;
          align-items: stretch;
        }

        .video-row .candles,
        .video-row .candles .flames {
          flex-direction: row;
          justify-content: center;
        }
      }
    `,
    ...blockStyles,
  ];

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('day') || (changed.has('open') && !this.open)) {
      this.revealed = new Set();
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    const dialog = this.dialog;
    if (!changed.has('open') || !dialog) {
      return;
    }
    if (this.open && !dialog.open) {
      dialog.showModal();
    } else if (!this.open && dialog.open) {
      dialog.close();
    }
  }

  /** Schließen per ✕, Escape oder Klick auf den abgedunkelten Hintergrund. */
  private requestClose(): void {
    if (this.open) {
      this.dispatchEvent(new CustomEvent('advent-dialog-close'));
    }
  }

  private onDialogClick(event: MouseEvent): void {
    // Klicks auf den Hintergrund landen direkt auf <dialog>, Klicks auf den Inhalt in .inner.
    if (event.target === this.dialog) {
      this.requestClose();
    }
  }

  private onToggleTask(section: Section): void {
    const shared = section === 'shared';
    this.dispatchEvent(
      new CustomEvent('task-toggle', {
        detail: { day: this.day, done: !(shared ? this.sharedTaskDone : this.taskDone), shared },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderSection(section: Section, content: DoorContent, videoAside?: TemplateResult) {
    return renderBlocks(content, {
      day: this.day,
      answerRevealed: this.revealed.has(section),
      taskDone: section === 'shared' ? this.sharedTaskDone : this.taskDone,
      onReveal: () => (this.revealed = new Set(this.revealed).add(section)),
      onToggleTask: () => this.onToggleTask(section),
      videoAside,
    });
  }

  /** Kerzen für den Adventssonntag, z. B. 🕯️🕯️ „2. Advent“. */
  private renderCandles(advent: number, row = false) {
    return html`
      <div class="candles ${row ? 'row' : ''}" role="img" aria-label="${advent}. Advent">
        <span class="flames" aria-hidden="true">
          ${Array.from({ length: advent }, () => html`<span class="flame">🕯️</span>`)}
        </span>
        <span class="label">${advent}. Advent</span>
      </div>
    `;
  }

  render() {
    return html`
      <dialog
        aria-labelledby="title"
        @click=${this.onDialogClick}
        @close=${this.requestClose}
      >
        ${this.open ? this.renderInner() : nothing}
      </dialog>
    `;
  }

  // Inhalt nur bei offenem Dialog rendern: Beim Schließen verschwinden so auch laufende Videos.
  private renderInner() {
    const shared = hasVisibleContent(this.sharedContent) ? this.sharedContent! : undefined;
    const personal = hasVisibleContent(this.content) ? this.content! : undefined;
    // Überschriften nur, wenn beide Teile etwas zeigen; gemeinsamer Inhalt kommt zuerst.
    const both = !!shared && !!personal;
    // Kerzen neben das erste Video; ohne Video als Zeile unter die Überschrift.
    const advent = this.advent && this.advent >= 1 && this.advent <= 4 ? this.advent : undefined;
    const hasVideo = (content?: DoorContent) => !!content && !!content.video && !!parseVideo(content.video);
    const candlesAt: Section | 'top' | undefined = !advent
      ? undefined
      : hasVideo(shared)
        ? 'shared'
        : hasVideo(personal)
          ? 'personal'
          : 'top';
    const aside = (section: Section) => (candlesAt === section ? this.renderCandles(advent!) : undefined);
    return html`
      <div class="inner">
        <header>
          <h2 id="title">Türchen ${this.day}</h2>
          <button class="close" aria-label="Schließen" @click=${this.requestClose}>✕</button>
        </header>
        ${candlesAt === 'top' ? this.renderCandles(advent!, true) : nothing}
        ${both ? html`<h3 class="section">🎄 Für alle</h3>` : nothing}
        ${shared ? this.renderSection('shared', shared, aside('shared')) : nothing}
        ${both ? html`<h3 class="section">Für dich</h3>` : nothing}
        ${personal ? this.renderSection('personal', personal, aside('personal')) : nothing}
        ${!shared && !personal ? html`<p class="empty">${this.emptyText}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(DIALOG_TAG)) {
  customElements.define(DIALOG_TAG, AdventCalendarDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-dialog': AdventCalendarDialog;
  }
}
