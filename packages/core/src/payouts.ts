// Payout, recoupment and payee-portal rules shared by the mock and the live server. Pure:
// the database stores facts, these turn them into what 4d, 4e and the portal say.
import { deriveShares, type DealTerms } from './dealSplit';
import type { Cents } from './money';
import { formatPercent } from './percent';
import { pctOf } from './splits';
import type { SplitRole } from './splitVersions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = (d: string | Date) => (typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d);
/** "Dec 1" and "Dec 1, 2026". */
export const dayMonth = (d: string | Date) => { const x = toDate(d); return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`; };
export const dayMonthYear = (d: string | Date) => `${dayMonth(d)}, ${toDate(d).getUTCFullYear()}`;

export type TaxState = { status: 'ok' | 'expiring' | 'missing'; label: string };
/**
 * A W-8BEN or W-8BEN-E stays in effect until the last day of the third calendar year after the
 * year it was signed (signed Mar 4, 2023: valid through Dec 31, 2026). A W-9 doesn't expire.
 */
export function w8ExpiresOn(signedOn: string | Date): string {
  return `${toDate(signedOn).getUTCFullYear() + 3}-12-31`;
}
/**
 * A W-8 expiring within 60 days needs replacing before it lapses; no form means no payout.
 * A W-9 never expires, so an expiry date stored against one is ignored.
 */
export function taxState(form: string | null, expiresOn: string | Date | null, today: string | Date): TaxState {
  if (!form) return { status: 'missing', label: 'Missing' };
  if (expiresOn && form !== 'W-9') {
    const days = (toDate(expiresOn).getTime() - toDate(today).getTime()) / 86_400_000;
    if (days < 0) return { status: 'missing', label: `Expired ${dayMonth(expiresOn)}` };
    if (days <= 60) return { status: 'expiring', label: `Expires ${dayMonth(expiresOn)}` };
  }
  return { status: 'ok', label: 'On file' };
}

/** What one role is owed under a split, in the words the portal uses ("3 points", "43.65%"). */
export function shareTerms(role: SplitRole, t: DealTerms): string {
  if (role === 'producer') return `${t.producerBp / 100} point${t.producerBp === 100 ? '' : 's'}`;
  return formatPercent(deriveShares(t)[role]);
}

/** How a payment was worked out, after "From Glasshouse, October." */
export function shareBasis(role: SplitRole, t: DealTerms): string {
  if (role === 'producer') return `${shareTerms(role, t)}.`;
  if (role === 'label') return `${formatPercent(t.labelOfNetBp)} of net profit.`;
  if (role === 'feature') return `${formatPercent(t.featureOfArtistBp)} of the artist share.`;
  return `${formatPercent(t.artistOfNetBp)} of net profit${t.featureOfArtistBp ? ', less feature' : ''}.`;
}

/**
 * The portal's prompt for a new version: what changes for this payee. Their own share first;
 * if theirs holds, whose does.
 */
export function signPrompt(role: SplitRole, from: DealTerms, to: DealTerms, firstNames: Record<SplitRole, string>): string {
  const a = deriveShares(from); const b = deriveShares(to);
  if (a[role] !== b[role]) {
    const dir = b[role] > a[role] ? 'up' : 'down';
    return role === 'producer'
      ? `Your points go ${dir} from ${shareTerms(role, from).split(' ')[0]} to ${shareTerms(role, to)}.`
      : `Your share goes ${dir} from ${formatPercent(a[role])} to ${formatPercent(b[role])} of recording income.`;
  }
  const mine = shareTerms(role, from);
  const verb = role === 'producer' && from.producerBp !== 100 ? 'don’t' : 'doesn’t';
  const other = (['artist', 'label', 'feature', 'producer'] as SplitRole[]).find((r) => r !== role && a[r] !== b[r]);
  return `Your ${mine} ${verb} change.${other ? ` ${firstNames[other]}’s share does.` : ''}`;
}

export type Cost = { cost: Cents; shareBp: number };
export type Entry = { period: string | Date; amount: Cents };
/**
 * A release's recoupment: the advance plus each cost's recoupable share. It is recouped in the
 * period whose entry brings the running total to the full amount.
 */
export function recoupment(advance: Cents, costs: Cost[], entries: Entry[]) {
  const recoupable = costs.reduce((a, c) => a + pctOf(c.cost, c.shareBp), 0);
  const total = advance + recoupable;
  let recouped = 0; let recoupedIn: Date | null = null;
  for (const e of [...entries].sort((x, y) => toDate(x.period).getTime() - toDate(y.period).getTime())) {
    recouped += e.amount;
    if (!recoupedIn && recouped >= total) recoupedIn = toDate(e.period);
  }
  return { recoupable, total, recouped, remaining: Math.max(0, total - recouped), recoupedIn: total > 0 ? recoupedIn : null };
}
/** "Oct 2026". */
export const monthYear = (d: string | Date) => `${MONTHS[toDate(d).getUTCMonth()]} ${toDate(d).getUTCFullYear()}`;
