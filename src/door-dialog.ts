import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { blockStyles, hasVisibleContent, renderBlocks } from './blocks';
import { parseVideo } from './blocks/video';
import { candleStyles, renderAdventCandles } from './advent-candles';
import type { MusicAction, MusicControl } from './blocks/simple-effect';
import type { DoorContent } from './types';

export const DIALOG_TAG = 'advent-calendar-dialog';

export const DEFAULT_EMPTY_TEXT = 'Heute ist das Türchen leer – schön, dass du da bist! 🎄';

/**
 * Modal mit dem Inhalt eines Türchens. Nutzt das native <dialog>-Element statt
 * HA-interner Komponenten, damit es über HA-Versionen hinweg stabil bleibt.
 *
 * Events: `advent-dialog-close`, `task-toggle` (detail: { day, done, shared }),
 * `music-control` (detail: { action, volume? }).
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
  /** Musik dieses Türchens: zeigt Tasten für Pause, Weiter und Stopp. */
  @property({ attribute: false }) music?: MusicControl;

  /** Abschnitte, deren Rätsel-Lösung schon aufgedeckt ist. */
  @state() private revealed: ReadonlySet<Section> = new Set();

  /** Stellung des Lautstärkereglers in Prozent, bis der Player den neuen Wert meldet. */
  @state() private volumeDraft?: number;
  private volumeDragging = false;

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

      .candles .label {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--secondary-text-color, #727272);
        white-space: nowrap;
      }

      /* Ohne Video: Kerzen mittig unter der Überschrift. */
      .candles.row {
        align-self: center;
      }

      .music {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        padding: 8px 10px 8px 14px;
        border-radius: 12px;
        background: var(--secondary-background-color, #f2f2f2);
      }

      .music .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .music .title,
      .music .player {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .music .player {
        font-size: 0.8em;
        color: var(--secondary-text-color, #727272);
      }

      .music button {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 36px;
        padding: 0 12px;
        border: none;
        border-radius: 18px;
        background: var(--primary-color, #03a9f4);
        color: var(--text-primary-color, #fff);
        font: inherit;
        font-size: 0.9em;
        cursor: pointer;
      }

      .music .volume {
        flex: 1 0 100%;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .music .volume input {
        flex: 1;
        min-width: 0;
        min-height: 32px;
        margin: 0;
        accent-color: var(--primary-color, #03a9f4);
        cursor: pointer;
      }

      .music .volume output {
        min-width: 3.2em;
        text-align: right;
        font-size: 0.9em;
        font-variant-numeric: tabular-nums;
      }

      .music button.secondary {
        background: transparent;
        color: inherit;
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.2));
      }

      .music button:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: 2px;
      }

      /* Schmale Bildschirme: Kerzen über dem Video, Musiktitel in eigener Zeile. */
      @media (max-width: 420px) {
        .music .info {
          flex: 1 0 100%;
        }

        .music button {
          flex: 1;
          justify-content: center;
        }

        .video-row {
          flex-direction: column-reverse;
          align-items: center;
        }

        .video-row .video {
          align-self: stretch;
        }
      }
    `,
    candleStyles,
    ...blockStyles,
  ];

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('day') || (changed.has('open') && !this.open)) {
      this.revealed = new Set();
      this.volumeDraft = undefined;
      this.volumeDragging = false;
    }
    if (changed.has('music') && !this.volumeDragging && changed.get('music')?.volume !== this.music?.volume) {
      this.volumeDraft = undefined;
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

  private onMusic(action: MusicAction): void {
    this.dispatchEvent(new CustomEvent('music-control', { detail: { action }, bubbles: true, composed: true }));
  }

  private onVolumeInput(event: Event): void {
    this.volumeDragging = true;
    this.volumeDraft = Number((event.target as HTMLInputElement).value);
  }

  /** Erst beim Loslassen senden, damit der Player nicht mit Befehlen überhäuft wird. */
  private onVolumeChange(event: Event): void {
    this.volumeDragging = false;
    this.volumeDraft = Number((event.target as HTMLInputElement).value);
    this.dispatchEvent(
      new CustomEvent('music-control', {
        detail: { action: 'volume', volume: this.volumeDraft / 100 },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderVolume(volume: number) {
    const percent = this.volumeDraft ?? Math.round(volume * 100);
    return html`
      <div class="volume">
        <span aria-hidden="true">🔊</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Lautstärke"
          .value=${String(percent)}
          @input=${this.onVolumeInput}
          @change=${this.onVolumeChange}
        />
        <output>${percent} %</output>
      </div>
    `;
  }

  /** Musik-Leiste: läuft → Pause + Stopp, pausiert → Weiter + Stopp, sonst → Nochmal abspielen. */
  private renderMusic(music: MusicControl) {
    if (music.state === 'unavailable' || music.state === 'unknown') {
      return nothing;
    }
    const running = music.state === 'playing' || music.state === 'buffering';
    const paused = music.state === 'paused';
    const button = (action: MusicAction, label: string, icon: string, secondary = false) => html`
      <button class=${secondary ? 'secondary' : ''} data-action=${action} @click=${() => this.onMusic(action)}>
        <span aria-hidden="true">${icon}</span>${label}
      </button>
    `;
    return html`
      <div class="music" role="group" aria-label="Musik">
        <div class="info">
          <span class="title">🎵 ${running || paused ? (music.title ?? 'Musik') : 'Musik zum Türchen'}</span>
          <span class="player">${music.name}</span>
        </div>
        ${running
          ? button('pause', 'Pause', '⏸')
          : paused
            ? button('play', 'Weiter', '▶')
            : button('replay', 'Abspielen', '▶')}
        ${running || paused ? button('stop', 'Stopp', '⏹', true) : nothing}
        ${(running || paused) && music.volume !== undefined ? this.renderVolume(music.volume) : nothing}
      </div>
    `;
  }

  /** Vier Kerzen für den Adventssonntag, davon `advent` angezündet, mit „2. Advent“. */
  private renderCandles(advent: number, row = false) {
    return html`
      <div class="candles ${row ? 'row' : ''}" role="img" aria-label="${advent}. Advent">
        ${renderAdventCandles(advent)}
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
        ${this.music ? this.renderMusic(this.music) : nothing}
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
