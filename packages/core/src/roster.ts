// Roster card rules: how an artist's type, genre and the one thing that's open read. Pure;
// the live server and tests share them.
import { daysBetween } from './dates';

/** A band reads as its size; anyone else as their role. */
export const memberType = (role: string, partyType: string, members: number) =>
  partyType === 'group' && members > 1 ? `Band · ${members} members` : role;

/** The genre most of their recordings share; ties go to the first one seen. */
export function mainGenre(genres: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const g of genres) if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best = ''; let n = 0;
  for (const [g, c] of counts) if (c > n) { best = g; n = c; }
  return best || 'Not set';
}

/** "Glasshouse release in 17 weeks"; days when it's under two weeks away. */
export function releaseCountdown(title: string, releaseIso: string, todayIso: string): string | null {
  const days = daysBetween(todayIso, releaseIso);
  if (days < 0) return null;
  if (days === 0) return `${title} releases today`;
  if (days < 14) return `${title} release in ${days} day${days === 1 ? '' : 's'}`;
  return `${title} release in ${Math.round(days / 7)} weeks`;
}

export type OpenItem = { open: string; href: string };
/** The one thing to look at, most urgent first: a decision, then a tax form, then the next release. */
export function openItem(c: { approval?: OpenItem; tax?: OpenItem; release?: OpenItem }): OpenItem {
  return c.approval ?? c.tax ?? c.release ?? { open: 'Nothing open', href: '/catalog' };
}
