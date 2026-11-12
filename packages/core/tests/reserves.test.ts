import { describe, expect, it } from 'vitest';
import { heldNote, heldShare, isHeld, reserveStatus } from '../src/reserves';

describe('reserves', () => {
  it('stay held until the release card is approved, or forfeit for good', () => {
    expect(reserveStatus({ outcome: null })).toBe('held');
    expect(reserveStatus({ outcome: 'release', releaseDecision: null })).toBe('releasing');
    expect(reserveStatus({ outcome: 'release', releaseDecision: 'rejected' })).toBe('releasing');
    expect(reserveStatus({ outcome: 'release', releaseDecision: 'approved' })).toBe('released');
    expect(reserveStatus({ outcome: 'release', releasedBefore: true })).toBe('released');
    expect(reserveStatus({ outcome: 'forfeit' })).toBe('forfeited');
    expect(['held', 'releasing', 'released', 'forfeited'].map((s) => isHeld(s as never))).toEqual([true, true, false, false]);
  });
  it('a line holds its share of the release’s flagged income, pro rata, never more than the line', () => {
    expect(heldShare(21420, 109928, 158618)).toBe(14845);
    expect(heldShare(21420, 0, 158618)).toBe(0);
    expect(heldShare(21420, 200000, 158618)).toBe(21420);
    expect(heldShare(0, 100, 100)).toBe(0);
  });
  it('says what is held and why', () => {
    expect(heldNote(14845, ['Night Bus'])).toBe('$148.45 held in reserve while Night Bus is checked for artificial streams.');
  });
});

import { runChecks } from '../src/checks';
describe('ROY-07 with reserves', () => {
  const facts = (flags: { recording: string; note: string; held?: boolean; heldCents?: number }[]) =>
    ({ kind: 'payout' as const, periodEnd: '2026-10-31', paysOn: '2026-11-10', minimumCents: 2500, payees: [], income: [], flags });
  const roy07 = (f: ReturnType<typeof facts>) => runChecks('money', f, '2026-11-11').find((r) => r.id === 'ROY-07')!;
  it('an open flag blocks until its income is held in reserve', () => {
    expect(roy07(facts([{ recording: 'Night Bus', note: 'unusual stream spike' }]))).toMatchObject({ status: 'fail' });
    expect(roy07(facts([{ recording: 'Night Bus', note: 'unusual stream spike', held: true, heldCents: 44535 }]))).toMatchObject({
      status: 'pass', message: 'Night Bus has an open audit flag. $445.35 of this batch is held in reserve until it’s resolved.',
    });
  });
});
