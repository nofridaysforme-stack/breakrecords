// Split math. Shares are basis points (100% = 10000). Money is integer cents.
import type { Cents } from './money';
import { FULL, type Bp } from './percent';

export type Share = { party: string; bp: Bp };

export type SplitCheck =
  | { ok: true; totalBp: Bp }
  | { ok: false; totalBp: Bp; gapBp: Bp; reason: 'under' | 'over' };

/** A split can be sent for signatures only when it totals exactly 100.00%. */
export function checkSplit(shares: Share[]): SplitCheck {
  if (shares.some((s) => !Number.isInteger(s.bp) || s.bp < 0)) {
    throw new Error('Shares must be non-negative integer basis points');
  }
  const totalBp = shares.reduce((sum, s) => sum + s.bp, 0);
  if (totalBp === FULL) return { ok: true, totalBp };
  return { ok: false, totalBp, gapBp: Math.abs(FULL - totalBp), reason: totalBp < FULL ? 'under' : 'over' };
}

/**
 * Divide an amount by shares. Each party gets floor(amount * share); the
 * leftover cents go to `remainderTo` (the party named in the split rule),
 * so the parts always add back to the amount. Never silently dropped.
 */
export function allocate(amount: Cents, shares: Share[], remainderTo: string): Record<string, Cents> {
  const check = checkSplit(shares);
  if (!check.ok) throw new Error(`Split totals ${check.totalBp / 100}%, not 100%`);
  if (!shares.some((s) => s.party === remainderTo)) throw new Error(`Remainder party "${remainderTo}" is not in the split`);
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const out: Record<string, Cents> = {};
  let given = 0;
  for (const s of shares) {
    const part = Math.floor((abs * s.bp) / FULL);
    out[s.party] = part;
    given += part;
  }
  out[remainderTo] += abs - given;
  for (const k of Object.keys(out)) out[k] = sign * out[k] || 0;
  return out;
}

/** Percentage of an amount in cents, rounded half up to the cent: (950000, 300) -> 28500. */
export function pctOf(amount: Cents, bp: Bp): Cents {
  return Math.round((amount * bp) / FULL);
}
