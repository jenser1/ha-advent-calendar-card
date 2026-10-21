import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { DoorStatus } from './date-logic';
import { prefersReducedMotion } from './themes';

export const DOOR_TAG = 'advent-calendar-door';

/** Dauer der Aufklapp-Animation; danach öffnet die Karte den Dialog. */
export const OPEN_ANIMATION_MS = 700;
const WOBBLE_MS = 450;

const STATUS_LABELS: Record<DoorStatus, string> = {
  locked: 'noch gesperrt',
  openable: 'heute öffenbar',
  opened: 'geöffnet',
  missed: 'verpasst',
};

/**
 * Ein einzelnes Türchen: Innen (sichtbar, wenn geöffnet) und davor der Türflügel,
 * der beim Öffnen in 3D aufklappt. Farben kommen aus den --advent-*-Variablen des Themes.
 */
export class AdventCalendarDoor extends LitElement {
  @property({ type: Number }) day = 0;
  /** Ohne Status (Stand noch nicht geladen) wird das Türchen neutral und nicht klickbar angezeigt. */
  @property() status?: DoorStatus;

  @state() private effect?: 'wobble' | 'opening';
  private effectTimer?: number;

  /** Wackeln, z. B. wenn ein gesperrtes Türchen angetippt wird. */
  wobble(): void {
    void this.play('wobble', WOBBLE_MS);
  }

  /** Aufklappen; der Status wechselt parallel auf „opened“. */
  playOpening(): void {
    void this.play('opening', OPEN_ANIMATION_MS);
  }

  private async play(effect: 'wobble' | 'opening', duration: number): Promise<void> {
    if (prefersReducedMotion()) {
      return;
    }
    window.clearTimeout(this.effectTimer);
    if (this.effect) {
      // Läuft schon eine Animation: Klasse kurz entfernen und Layout erzwingen, damit sie neu startet.
      this.effect = undefined;
      await this.updateComplete;
      this.shadowRoot?.querySelector('.door')?.getBoundingClientRect();
    }
    this.effect = effect;
    this.effectTimer = window.setTimeout(() => (this.effect = undefined), duration);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.effectTimer);
  }

  static styles = css`
    :host {
      display: block;
    }

    .door {
      container-type: inline-size;
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 1;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: var(--advent-radius, 12px);
      background: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
      perspective: 600px;
      -webkit-tap-highlight-color: transparent;
    }

    .door:disabled {
      cursor: default;
    }

    .door:focus-visible {
      outline: 2px solid var(--advent-accent, var(--primary-color, #03a9f4));
      outline-offset: 3px;
    }

    .inside,
    .leaf {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      border-radius: inherit;
      display: grid;
      place-items: center;
    }

    .inside {
      align-content: center;
      gap: 2%;
      background: var(--advent-inside, rgba(0, 0, 0, 0.25));
      box-shadow: inset 0 3px 10px rgba(0, 0, 0, 0.45);
      color: var(--advent-accent, var(--primary-color, #03a9f4));
    }

    .inside-number {
      font-family: var(--advent-font, inherit);
      font-size: 26cqi;
      font-weight: 700;
      line-height: 1;
    }

    .inside-check {
      font-size: 20cqi;
      line-height: 1;
    }

    .leaf {
      background: var(
        --advent-door-bg,
        linear-gradient(145deg, var(--secondary-background-color, #f2f2f2), var(--card-background-color, #fff))
      );
      border: 1px solid var(--advent-door-border, var(--divider-color, rgba(0, 0, 0, 0.12)));
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      color: var(--advent-number, var(--primary-color, #03a9f4));
      transform-origin: left center;
    }

    .number {
      font-family: var(--advent-font, inherit);
      font-size: var(--advent-number-size, 40cqi);
      font-weight: 700;
      line-height: 1;
      text-shadow: var(--advent-number-shadow, none);
    }

    .badge {
      position: absolute;
      top: 6%;
      right: 8%;
      font-size: 15cqi;
      line-height: 1;
      opacity: 0.75;
    }

    .note {
      position: absolute;
      bottom: 7%;
      left: 0;
      right: 0;
      font-size: 11cqi;
      line-height: 1.1;
      text-align: center;
      color: inherit;
    }

    .openable .leaf {
      border: 2px solid var(--advent-accent, var(--primary-color, #03a9f4));
      animation: advent-pulse 2.2s ease-in-out infinite;
    }

    .openable .note {
      font-weight: 700;
    }

    /* Geöffnet: Der Flügel steht schräg offen, dahinter das Innere mit ✔. */
    .opened .leaf {
      transform: rotateY(-72deg);
      box-shadow: none;
    }

    .opening .leaf {
      animation: advent-open 0.7s cubic-bezier(0.3, 0.7, 0.4, 1) both;
    }

    .wobble .leaf {
      animation: advent-wobble 0.45s ease-in-out;
    }

    .missed {
      cursor: default;
    }

    .missed .leaf {
      opacity: 0.45;
      filter: grayscale(1);
    }

    @keyframes advent-pulse {
      0%,
      100% {
        box-shadow: 0 0 4px var(--advent-accent, var(--primary-color, #03a9f4));
      }
      50% {
        box-shadow: 0 0 18px var(--advent-accent, var(--primary-color, #03a9f4));
      }
    }

    @keyframes advent-open {
      from {
        transform: rotateY(0deg);
      }
      to {
        transform: rotateY(-72deg);
      }
    }

    @keyframes advent-wobble {
      0%,
      100% {
        transform: rotate(0deg);
      }
      20% {
        transform: rotate(-5deg);
      }
      40% {
        transform: rotate(4deg);
      }
      60% {
        transform: rotate(-3deg);
      }
      80% {
        transform: rotate(2deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .leaf {
        animation: none !important;
      }
    }
  `;

  render() {
    const status = this.status;
    return html`
      <button
        class="door ${status ?? ''} ${this.effect ?? ''}"
        ?disabled=${!status}
        aria-label=${status ? `Türchen ${this.day}, ${STATUS_LABELS[status]}` : `Türchen ${this.day}`}
      >
        ${status === 'opened'
          ? html`
              <span class="inside" aria-hidden="true">
                <span class="inside-number">${this.day}</span>
                <span class="inside-check">✔</span>
              </span>
            `
          : nothing}
        <span class="leaf">
          <span class="number">${this.day}</span>
          ${this.renderExtra()}
        </span>
      </button>
    `;
  }

  private renderExtra() {
    switch (this.status) {
      case 'locked':
        return html`<span class="badge" aria-hidden="true">🔒</span>`;
      case 'openable':
        return html`<span class="note" aria-hidden="true">Heute!</span>`;
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
