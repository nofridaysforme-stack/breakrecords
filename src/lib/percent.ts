// Shares are integer basis points of a percent: 43.65% = 4365, 100% = 10000.
import { digitsToWords, integerToWords } from './words';

export type Bp = number;
export const FULL: Bp = 10000;

/** 43.65 -> 4365. Rounds to the nearest hundredth of a percent. */
export function pctToBp(pct: number): Bp {
  return Math.round(pct * 100);
}

/** 4365 -> "43.65%". `fixed` keeps two decimals ("3.00%"); otherwise trailing zeros are trimmed ("3%"). */
export function formatPercent(bp: Bp, opts: { fixed?: boolean } = {}): string {
  const s = (Math.abs(bp) / 100).toFixed(2);
  const out = opts.fixed ? s : s.replace(/\.?0+$/, '');
  return `${bp < 0 ? '−' : ''}${out}%`;
}

/** 4365 -> "forty-three point six five percent". */
export function percentToWords(bp: Bp): string {
  const [whole, frac] = (Math.abs(bp) / 100).toFixed(2).split('.');
  const trimmed = frac.replace(/0+$/, '');
  const words = integerToWords(Number(whole)) + (trimmed ? ` point ${digitsToWords(trimmed)}` : '');
  return `${bp < 0 ? 'minus ' : ''}${words} percent`;
}
