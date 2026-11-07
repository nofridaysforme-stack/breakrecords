// White-label theme (5i). A tenant sets 5 colors; the rest of the token set is derived from
// them and applied as CSS variables at runtime, on any element (the live preview) or on the
// document root. Publishing is refused while any text pair fails WCAG AA.
import { AA, contrast, isHex, mix } from './contrast';

export type ThemeColors = {
  background: string;
  surface: string;
  brand: string;
  primary: string;
  text: string;
};

export const THEME_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'brand', label: 'Brand block' },
  { key: 'primary', label: 'Primary action' },
  { key: 'text', label: 'Text' },
];

const BLACK = '#000000'; // lint-allow-hex: mixing anchor, not a UI color
const WHITE = '#ffffff'; // lint-allow-hex: mixing anchor, not a UI color

/** Text on the primary button: whichever of background or text reads better on it. */
export function onPrimary(c: ThemeColors) {
  return contrast(c.background, c.primary) >= contrast(c.text, c.primary) ? c.background : c.text;
}

/** Every derived color the app needs, keyed by CSS variable. */
export function themeVars(c: ThemeColors): Record<string, string> {
  const line = (pct: number) => `color-mix(in srgb, ${c.text} ${pct}%, transparent)`;
  return {
    '--bg': c.background,
    '--bg-sidebar': mix(c.background, BLACK, 0.3),
    '--surface': c.surface,
    '--surface-raised': mix(c.surface, c.text, 0.06),
    '--track': mix(c.surface, c.text, 0.12),
    '--text': c.text,
    '--text-2': mix(c.text, c.background, 0.18),
    '--text-muted': mix(c.text, c.background, 0.3),
    '--text-faint': mix(c.text, c.background, 0.5),
    '--line': line(8), '--line-soft': line(6), '--line-control': line(18), '--line-chip': line(14),
    '--accent': c.primary,
    '--accent-hover': mix(c.primary, WHITE, 0.15),
    '--on-accent': onPrimary(c),
    '--accent-line': `color-mix(in srgb, ${c.primary} 45%, transparent)`,
    '--brand': c.brand,
    '--on-brand': c.text,
    '--on-brand-2': mix(c.text, c.brand, 0.12),
    '--on-brand-label': mix(c.text, c.brand, 0.2),
    '--brand-line': `color-mix(in srgb, ${c.text} 35%, transparent)`,
  };
}

export type ContrastCheck = { pair: string; fg: string; bg: string; ratio: number; pass: boolean };

/** The text pairs the app actually draws. Each must reach 4.5:1. */
export function checkTheme(c: ThemeColors): ContrastCheck[] {
  if (!Object.values(c).every(isHex)) return [];
  const v = themeVars(c);
  const pairs: [string, string, string][] = [
    ['Text on background', c.text, c.background],
    ['Text on surface', c.text, c.surface],
    ['Secondary text on background', v['--text-2'], c.background],
    ['Muted text on surface', v['--text-muted'], c.surface],
    ['Text on brand block', c.text, c.brand],
    ['Brand block label', v['--on-brand-label'], c.brand],
    ['Button text on primary', v['--on-accent'], c.primary],
    ['Primary as link on background', c.primary, c.background],
  ];
  return pairs.map(([pair, fg, bg]) => {
    const ratio = contrast(fg, bg);
    return { pair, fg, bg, ratio, pass: ratio >= AA };
  });
}

