import { describe, expect, it } from 'vitest';
import { mainGenre, memberType, openItem, releaseCountdown } from '../src/roster';

describe('roster cards', () => {
  it('a band reads as its size', () => {
    expect(memberType('Band', 'group', 3)).toBe('Band · 3 members');
    expect(memberType('Solo artist', 'person', 1)).toBe('Solo artist');
  });
  it('the genre most recordings share', () => {
    expect(mainGenre(['R&B', null, 'R&B', 'Pop'])).toBe('R&B');
    expect(mainGenre([null])).toBe('Not set');
  });
  it('counts down to a release in weeks, then days', () => {
    expect(releaseCountdown('Glasshouse', '2027-03-05', '2026-11-08')).toBe('Glasshouse release in 17 weeks');
    expect(releaseCountdown('Glasshouse', '2026-11-15', '2026-11-08')).toBe('Glasshouse release in 7 days');
    expect(releaseCountdown('Glasshouse', '2026-11-08', '2026-11-08')).toBe('Glasshouse releases today');
    expect(releaseCountdown('Glasshouse', '2026-11-01', '2026-11-08')).toBeNull();
  });
  it('a decision comes before a tax form, and a tax form before a release', () => {
    const approval = { open: 'Producer agreement needs your eyes', href: '/approvals/apr_producer' };
    const tax = { open: 'Rue Sato’s tax form expires Dec 1', href: '/money/payouts' };
    const release = { open: 'Glasshouse release in 17 weeks', href: '/releases/rel_glasshouse' };
    expect(openItem({ approval, tax, release })).toBe(approval);
    expect(openItem({ tax, release })).toBe(tax);
    expect(openItem({})).toEqual({ open: 'Nothing open', href: '/catalog' });
  });
});
