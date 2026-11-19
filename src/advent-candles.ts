import { css, svg, type SVGTemplateResult } from 'lit';

/**
 * Adventskranz-Kerzen als SVG: immer vier rote Kerzen, am n. Advent brennen die
 * ersten n. Jede brennende Kerze ist pro Woche ein Stück heruntergebrannt – am
 * 4. Advent ist die erste also am kürzesten.
 */

const WIDTH = 22;
const GAP = 8;
const BOTTOM = 108;
/** Höhe einer neuen Kerze und wie viel sie pro Woche abbrennt. */
const FULL = 70;
const PER_WEEK = 14;

export const CANDLE_COUNT = 4;

/** Wie viele Wochen Kerze `index` (0–3) am `advent`. Advent schon brennt (0 = aus). */
export function burnedWeeks(advent: number, index: number): number {
  return Math.max(0, advent - index);
}

export function candleHeight(advent: number, index: number): number {
  // Die gerade erst angezündete Kerze ist noch fast neu.
  const weeks = burnedWeeks(advent, index);
  return weeks === 0 ? FULL : FULL - (weeks - 1) * PER_WEEK - 3;
}

function renderCandle(advent: number, index: number): SVGTemplateResult {
  const x = index * (WIDTH + GAP) + 4;
  const height = candleHeight(advent, index);
  const top = BOTTOM - height;
  const cx = x + WIDTH / 2;
  const lit = burnedWeeks(advent, index) > 0;
  return svg`
    <g class="candle ${lit ? 'lit' : 'out'}" data-height=${height}>
      <rect class="body" x=${x} y=${top} width=${WIDTH} height=${height} rx="3" fill="url(#advent-wax)" />
      <ellipse cx=${cx} cy=${top + 1} rx=${WIDTH / 2} ry="3" fill="#ff6a4d" />
      <ellipse cx=${cx} cy=${top + 1.5} rx=${WIDTH / 2 - 3} ry="1.6" fill="#e0301f" />
      <rect x=${x} y=${top} width="6" height="9" rx="3" fill="#ff5a3c" />
      <rect x=${x + 13} y=${top} width="5" height="6" rx="2.5" fill="#ff5a3c" />
      <rect x=${x + WIDTH - 3} y=${top} width="3" height="11" rx="1.5" fill="#f4482f" />
      <line x1=${cx} y1=${top + 1} x2=${cx} y2=${top - 5} stroke="#3a2418" stroke-width="1.6" stroke-linecap="round" />
      ${lit
        ? svg`
          <g class="flame">
            <circle cx=${cx} cy=${top - 13} r="15" fill="url(#advent-glow)" />
            <path
              d="M ${cx} ${top - 26} C ${cx + 7} ${top - 17}, ${cx + 6} ${top - 8}, ${cx} ${top - 5} C ${cx - 6} ${top - 8}, ${cx - 7} ${top - 17}, ${cx} ${top - 26} Z"
              fill="url(#advent-flame)"
            />
            <path
              d="M ${cx} ${top - 18} C ${cx + 3} ${top - 13}, ${cx + 3} ${top - 8}, ${cx} ${top - 6} C ${cx - 3} ${top - 8}, ${cx - 3} ${top - 13}, ${cx} ${top - 18} Z"
              fill="#fff6c8"
            />
          </g>
        `
        : svg``}
    </g>
  `;
}

/** Vier Kerzen nebeneinander, am `advent`. Advent brennen die ersten `advent`. */
export function renderAdventCandles(advent: number): SVGTemplateResult {
  const width = CANDLE_COUNT * WIDTH + (CANDLE_COUNT - 1) * GAP + 8;
  return svg`
    <svg class="wreath" viewBox="0 0 ${width} ${BOTTOM + 2}" aria-hidden="true">
      <defs>
        <linearGradient id="advent-wax" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#ff5b45" />
          <stop offset="0.45" stop-color="#e3170f" />
          <stop offset="1" stop-color="#a50c0c" />
        </linearGradient>
        <linearGradient id="advent-flame" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ffb02e" />
          <stop offset="0.6" stop-color="#ffd76a" />
          <stop offset="1" stop-color="#ff8a1f" />
        </linearGradient>
        <radialGradient id="advent-glow">
          <stop offset="0" stop-color="#ffb347" stop-opacity="0.75" />
          <stop offset="1" stop-color="#ff8c1a" stop-opacity="0" />
        </radialGradient>
      </defs>
      ${Array.from({ length: CANDLE_COUNT }, (_, index) => renderCandle(advent, index))}
    </svg>
  `;
}

export const candleStyles = css`
  .wreath {
    display: block;
    width: 120px;
    height: auto;
    overflow: visible;
  }

  .wreath .flame {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: flicker 2.4s ease-in-out infinite;
  }

  .wreath .candle:nth-child(3) .flame {
    animation-delay: -0.6s;
  }

  .wreath .candle:nth-child(4) .flame {
    animation-delay: -1.2s;
  }

  .wreath .candle:nth-child(5) .flame {
    animation-delay: -1.8s;
  }

  @keyframes flicker {
    0%,
    100% {
      transform: rotate(-3deg) scaleY(1);
    }
    50% {
      transform: rotate(3deg) scaleY(1.06);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wreath .flame {
      animation: none;
    }
  }
`;
