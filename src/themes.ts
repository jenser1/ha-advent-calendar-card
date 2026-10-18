export const THEMES = ['winter', 'kids', 'nerd'] as const;

export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = 'winter';

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Erstes gesetztes Theme gewinnt (z. B. Person vor Karte), sonst das Standard-Theme. */
export function resolveTheme(...candidates: (ThemeName | undefined)[]): ThemeName {
  return candidates.find((theme) => theme !== undefined) ?? DEFAULT_THEME;
}
