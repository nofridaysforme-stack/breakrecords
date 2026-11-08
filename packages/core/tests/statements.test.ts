import { describe, expect, it } from 'vitest';
import { changeNote, checkStatement, editDistance, periodLabel, suggestIsrcMatch, unmatchedNote } from '../src/statements';
import { runWaterfall } from '../src/waterfall';

const catalog = [
  { id: 'night-bus', title: 'Night Bus', isrc: 'USNL12500031' },
  { id: 'static-hymn', title: 'Static Hymn', isrc: 'USNL12500032' },
  { id: 'night-bus-demo', title: 'Night Bus (demo)', isrc: 'USNL12500029' },
  { id: 'low-light', title: 'Low Light', isrc: null },
];

describe('matching reported ISRCs to the catalog', () => {
  it('measures keystrokes', () => {
    expect(editDistance('USNL1250031', 'USNL12500031')).toBe(1);
    expect(editDistance('USNL1250031', 'USNL12500032')).toBe(2);
    expect(editDistance('abc', 'abc')).toBe(0);
  });
  it('a dropped digit is suggested as a typo of the one recording it is close to', () => {
    expect(suggestIsrcMatch('USNL1250031', catalog)).toEqual({
      recordingId: 'night-bus', recording: 'Night Bus', recordingIsrc: 'USNL12500031', reason: 'one digit short of Night Bus (USNL12500031)',
    });
  });
  it('says how the code differs', () => {
    expect(suggestIsrcMatch('USNL12500039', [catalog[2]])?.reason).toBe('one digit off from Night Bus (demo) (USNL12500029)');
    expect(suggestIsrcMatch('USNL125000311', [catalog[0]])?.reason).toBe('one digit longer than Night Bus (USNL12500031)');
  });
  it('no suggestion when two recordings are equally close, or none is', () => {
    expect(suggestIsrcMatch('USNL12500033', catalog)).toBeNull(); // one off from both 31 and 32
    expect(suggestIsrcMatch('GBXYZ9900001', catalog)).toBeNull();
    expect(suggestIsrcMatch('USNL12500031', catalog)).toBeNull(); // an exact ISRC is a match, not a typo
  });
  it('the note names the biggest typo group', () => {
    expect(unmatchedNote([{ count: 24, recording: 'Night Bus' }, { count: 2, recording: 'Static Hymn' }], 3)).toBe('Royalties Agent thinks 24 are a typo in "Night Bus" metadata.');
    expect(unmatchedNote([], 3)).toBe('Royalties Agent is asking the sources about them.');
    expect(unmatchedNote([], 0)).toBe('Every line is matched.');
  });
});

describe('period notes', () => {
  it('labels a month', () => {
    expect(periodLabel('2026-10-01')).toBe('October 2026');
    expect(periodLabel(new Date(Date.UTC(2026, 8, 1)))).toBe('September 2026');
  });
  it('compares with the period before, to the whole percent', () => {
    expect(changeNote(1428640, 1210712, '2026-09-01')).toBe('Up 18% on September');
    expect(changeNote(900, 1000, '2026-09-01')).toBe('Down 10% on September');
    expect(changeNote(1000, 1001, '2026-09-01')).toBe('Level with September');
    expect(changeNote(1000, null, null)).toBe('First period on record');
  });
});

describe('issued statements', () => {
  const rows = runWaterfall([
    { kind: 'start', label: 'Income', rule: 'All stores', amount: 1000000 },
    { kind: 'step', label: 'Platform fee', rule: '5% of gross', amount: -50000 },
    { kind: 'subtotal', label: 'Base' },
  ]);
  it('a consistent statement passes', () => expect(checkStatement(rows, 950000)).toBeNull());
  it('the net must be the last balance', () => expect(checkStatement(rows, 950001)).toBe('net_mismatch'));
  it('balances must be the running total', () => {
    expect(checkStatement([rows[0], { ...rows[1], balance: 940000 }, rows[2]], 950000)).toBe('bad_balance');
  });
  it('money is integer cents and starts with income', () => {
    expect(checkStatement([{ kind: 'start', label: 'Income', rule: 'All stores', amount: 10.5, balance: 10.5 }], 10.5)).toBe('not_cents');
    expect(checkStatement(rows.slice(1), 950000)).toBe('no_start');
    expect(checkStatement([], 0)).toBe('empty');
  });
});
