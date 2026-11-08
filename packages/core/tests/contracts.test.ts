import { describe, expect, it } from 'vitest';
import { contractsSummary, keyDateLabel, shareTerms, signatures } from '../src/contracts';

describe('agreement signatures', () => {
  it('waits on you while its approval is open, and goes back to Legal when rejected', () => {
    expect(signatures({ approval: 'pending', signed: 0, of: 2 })).toEqual({ sig: 'Waiting on you', sigState: 'waiting' });
    expect(signatures({ approval: 'rejected', signed: 0, of: 2 })).toEqual({ sig: 'Changes requested', sigState: 'waiting' });
  });
  it('counts signatures until everyone has signed', () => {
    expect(signatures({ approval: 'none', signed: 1, of: 2 })).toEqual({ sig: '1 of 2 signed', sigState: 'partial' });
    expect(signatures({ approval: 'approved', signed: 2, of: 2 })).toEqual({ sig: 'Signed', sigState: 'signed' });
    expect(signatures({ approval: 'none', signed: 0, of: 0 }).sigState).toBe('partial');
  });
});

describe('key dates and summary', () => {
  it('drops the year within the next twelve months', () => {
    expect(keyDateLabel('2027-01-09', '2026-11-08')).toBe('Jan 9');
    expect(keyDateLabel('2029-03-06', '2026-11-08')).toBe('Mar 6, 2029');
    expect(keyDateLabel('2026-11-09', '2026-11-08')).toBe('Nov 9');
  });
  it('writer shares read as a ratio', () => {
    expect(shareTerms([7500, 2500])).toBe('75 / 25');
    expect(shareTerms([3400, 3300, 3300])).toBe('34 / 33 / 33');
    expect(shareTerms([3333, 6667])).toBe('33.33 / 66.67');
  });
  it('the 5b subtitle', () => {
    const rows = [
      { sigState: 'waiting' as const, date: '2026-11-09' }, { sigState: 'signed' as const, date: '2029-03-06' },
      { sigState: 'signed' as const, date: '2027-01-09' }, { sigState: 'partial' as const, date: null },
    ];
    expect(contractsSummary(rows, '2026-11-08')).toBe('4 active · 1 waiting on signatures · next key date Nov 9');
    expect(contractsSummary(rows, '2026-11-10')).toBe('4 active · 1 waiting on signatures · next key date Jan 9');
  });
});
