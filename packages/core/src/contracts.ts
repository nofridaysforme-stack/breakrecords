// Contract rules (5b and the template pages), shared by the mock and the live server: how an
// agreement's signatures, key date and the page summary read.
import { dayMonth, dayMonthYear } from './payouts';

export type SigState = 'waiting' | 'signed' | 'partial';
export type Sig = { sig: string; sigState: SigState };

/**
 * An agreement the label still has to approve is waiting on you; a rejected one is back with
 * Legal. Otherwise it's signed once everyone has, or shows how many of how many have.
 */
export function signatures(a: { approval: 'none' | 'pending' | 'approved' | 'rejected'; signed: number; of: number }): Sig {
  if (a.approval === 'pending') return { sig: 'Waiting on you', sigState: 'waiting' };
  if (a.approval === 'rejected') return { sig: 'Changes requested', sigState: 'waiting' };
  if (a.of > 0 && a.signed >= a.of) return { sig: 'Signed', sigState: 'signed' };
  return { sig: `${a.signed} of ${a.of} signed`, sigState: 'partial' };
}

/** Within a year the day and month are enough ("Jan 9"); further out, the year too ("Mar 6, 2029"). */
export function keyDateLabel(date: string | Date, today: string | Date): string {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const t = typeof today === 'string' ? new Date(`${today.slice(0, 10)}T00:00:00Z`) : today;
  return d.getTime() - t.getTime() <= 365 * 86_400_000 && d.getTime() >= t.getTime() - 31 * 86_400_000 ? dayMonth(d) : dayMonthYear(d);
}

/** Writer shares as 5b shows them: "75 / 25". Shares are basis points. */
export const shareTerms = (bps: number[]) => bps.map((b) => (b % 100 ? (b / 100).toFixed(2) : String(b / 100))).join(' / ');

/** The 5b subtitle: how many agreements, how many wait on you, and the next key date in an agreement after today. */
export function contractsSummary(rows: { sigState: SigState; date: string | null }[], today: string): string {
  const waiting = rows.filter((r) => r.sigState === 'waiting').length;
  const next = rows.map((r) => r.date).filter((d): d is string => !!d && d > today).sort()[0];
  return `${rows.length} active · ${waiting} waiting on signatures${next ? ` · next key date ${keyDateLabel(next, today)}` : ''}`;
}
