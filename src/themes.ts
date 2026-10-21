import { css } from 'lit';
import { DOOR_COUNT } from './date-logic';

export const THEMES = ['winter', 'kids', 'nerd'] as const;

export type ThemeName = (typeof THEMES)[number];

export type ColorMode = 'light' | 'dark';

export const DEFAULT_THEME: ThemeName = 'winter';

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Erstes gesetztes Theme gewinnt (z. B. Person vor Karte), sonst das Standard-Theme. */
export function resolveTheme(...candidates: (ThemeName | undefined)[]): ThemeName {
  return candidates.find((theme) => theme !== undefined) ?? DEFAULT_THEME;
}

/** Hell oder dunkel passend zu HA; nerd ist als Terminal immer dunkel. */
export function colorMode(theme: ThemeName, darkMode: boolean): ColorMode {
  return theme === 'nerd' || darkMode ? 'dark' : 'light';
}

/** kids: jedes Türchen in einer anderen Farbe. */
const DOOR_PALETTES: Partial<Record<ThemeName, Record<ColorMode, readonly string[]>>> = {
  kids: {
    light: ['#ff6b6b', '#ffa94d', '#fcc419', '#51cf66', '#339af0', '#9775fa', '#f06595'],
    dark: ['#c92a2a', '#d9480f', '#e67700', '#2b8a3e', '#1864ab', '#5f3dc4', '#a61e4d'],
  },
};

export function doorColor(theme: ThemeName, mode: ColorMode, day: number): string | undefined {
  const palette = DOOR_PALETTES[theme]?.[mode];
  return palette ? palette[(day - 1) % palette.length] : undefined;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function hashString(text: string): number {
  // FNV-1a
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Türchen 1–24 in zufälliger, für denselben Startwert (user_id + Jahr) immer gleicher Reihenfolge. */
export function shuffledDays(seed: string, count = DOOR_COUNT): number[] {
  const days = Array.from({ length: count }, (_, i) => i + 1);
  const random = mulberry32(hashString(seed));
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }
  return days;
}

/**
 * Farbwelten der Themes als CSS-Variablen auf <ha-card>. Türchen und Schnee lesen
 * sie über --advent-*; der Dialog nutzt bewusst weiter die HA-Farben.
 * Keine Web-Fonts, damit alles offline funktioniert.
 */
export const themeStyles = css`
  .theme-winter {
    --advent-font: Georgia, 'Times New Roman', serif;
    --advent-radius: 10px;
    --advent-number-size: 40cqi;
  }

  .theme-winter.dark {
    --advent-bg: linear-gradient(165deg, #0a1a36 0%, #13294f 55%, #1d3b6e 100%);
    --advent-text: #f3e2ad;
    --advent-muted: #a9b8d4;
    --advent-door-bg: linear-gradient(145deg, #1b3a6b, #0f2448);
    --advent-door-border: rgba(214, 178, 74, 0.55);
    --advent-number: #e6c35c;
    --advent-accent: #ffd56b;
    --advent-inside: #081429;
    --advent-snow: rgba(255, 255, 255, 0.85);
  }

  .theme-winter.light {
    --advent-bg: linear-gradient(165deg, #f2f7fc 0%, #dceaf6 100%);
    --advent-text: #1b3a66;
    --advent-muted: #5b6f8c;
    --advent-door-bg: linear-gradient(145deg, #ffffff, #e5eff8);
    --advent-door-border: rgba(176, 141, 46, 0.55);
    --advent-number: #a8811f;
    --advent-accent: #c9971c;
    --advent-inside: #c9dbec;
    --advent-snow: rgba(120, 160, 205, 0.7);
  }

  .theme-kids {
    --advent-font: 'Comic Sans MS', 'Chalkboard SE', 'Segoe Print', 'Comic Neue', cursive, sans-serif;
    --advent-radius: 18px;
    --advent-number-size: 50cqi;
    --advent-number: #ffffff;
    --advent-number-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
  }

  .theme-kids.light {
    --advent-bg: linear-gradient(165deg, #fff9e6 0%, #ffeef4 100%);
    --advent-text: #d9480f;
    --advent-muted: #8c6d5a;
    --advent-door-bg: #ff922b;
    --advent-door-border: rgba(255, 255, 255, 0.9);
    --advent-accent: #f03e3e;
    --advent-inside: #fff3bf;
    --advent-snow: rgba(150, 190, 255, 0.8);
  }

  .theme-kids.dark {
    --advent-bg: linear-gradient(165deg, #1f1b33 0%, #2b1f3d 100%);
    --advent-text: #ffd43b;
    --advent-muted: #b8a9d9;
    --advent-door-bg: #d9480f;
    --advent-door-border: rgba(255, 255, 255, 0.35);
    --advent-accent: #ffd43b;
    --advent-inside: #120f1f;
    --advent-snow: rgba(255, 255, 255, 0.85);
  }

  .theme-nerd {
    --advent-font: 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace;
    --advent-radius: 4px;
    --advent-number-size: 38cqi;
    --advent-bg: #0b0f0b;
    --advent-text: #39ff6a;
    --advent-muted: #2fa84f;
    --advent-door-bg: #0f1a12;
    --advent-door-border: #1f6b34;
    --advent-number: #39ff6a;
    --advent-number-shadow: 0 0 6px rgba(57, 255, 106, 0.6);
    --advent-accent: #39ff6a;
    --advent-inside: #050805;
    --advent-snow: rgba(57, 255, 106, 0.6);
  }

  .theme-nerd .card-header {
    font-family: var(--advent-font);
  }

  .theme-nerd .card-header::before {
    content: '> ';
  }

  .theme-nerd .card-header::after {
    content: '_';
    animation: advent-blink 1s steps(1) infinite;
  }

  @keyframes advent-blink {
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-nerd .card-header::after {
      animation: none;
    }
  }
`;
