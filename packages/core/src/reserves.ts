// Reserves: income from a flagged recording is held until the flag is resolved. Pure rules,
// shared by the mock and the live server.
import { formatMoney, type Cents } from './money';

export type ReserveOutcome = 'release' | 'forfeit';
export type ReserveStatus = 'held' | 'releasing' | 'released' | 'forfeited';

/**
 * Where a reserve stands. Choosing "real listeners" doesn't pay anything by itself: the money
 * is released only once its approval card is approved.
 */
export function reserveStatus(r: { outcome: ReserveOutcome | null; releaseDecision?: 'approved' | 'rejected' | null; releasedBefore?: boolean }): ReserveStatus {
  if (r.outcome === 'forfeit') return 'forfeited';
  if (r.outcome === 'release') return r.releasedBefore || r.releaseDecision === 'approved' ? 'released' : 'releasing';
  return 'held';
}
/** Held money stays out of payouts until it is released. */
export const isHeld = (s: ReserveStatus) => s === 'held' || s === 'releasing';

/**
 * A payout line's share of a release's income that comes from flagged recordings, in cents.
 * Pro rata: the line is paid from the release's income for the period, so it holds the same
 * fraction the flagged recordings earned. Rounded half up, never more than the line.
 */
export function heldShare(line: Cents, flaggedIncome: Cents, releaseIncome: Cents): Cents {
  if (line <= 0 || flaggedIncome <= 0 || releaseIncome <= 0) return 0;
  return Math.min(line, Math.round((line * Math.min(flaggedIncome, releaseIncome)) / releaseIncome));
}

/** The line that explains a hold on a statement or payout. */
export const heldNote = (held: Cents, recordings: string[]) =>
  `${formatMoney(held)} held in reserve while ${recordings.join(' and ')} ${recordings.length === 1 ? 'is' : 'are'} checked for artificial streams.`;
