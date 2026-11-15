import { describe, expect, it } from 'vitest';
import { auditToActivity, stateLabel, whenLabel, displayName, collapseRepeats } from '../src/activity';

describe('activity log', () => {
  it('times read in UTC', () => {
    expect(whenLabel(new Date('2026-11-06T09:12:00Z'))).toBe('Nov 6, 9:12');
    expect(whenLabel(new Date('2026-11-05T17:05:00Z'))).toBe('Nov 5, 17:05');
  });
  it('a decision reads as an approval with the item’s title', () => {
    const r = auditToActivity({ auditId: 'AUD-7F3K-2291', at: new Date('2026-11-08T10:00:00Z'), kind: 'approval.approved', ref: 'apr_mlc', data: {}, who: 'Jana', approvalTitle: 'MLC filing, Glasshouse' });
    expect(r).toEqual({ id: 'AUD-7F3K-2291', when: 'Nov 8, 10:00', kind: 'Approval', text: 'Approved MLC filing, Glasshouse', who: 'Jana', dept: 'Approvals',
      inputs: ['apr_mlc'], reasoning: 'Done by Jana in the app.', output: 'Recorded in the audit log as AUD-7F3K-2291.' });
  });
  it('other changes read as edits, in their department', () => {
    const at = new Date('2026-11-08T10:00:00Z');
    expect(auditToActivity({ auditId: 'A', at, kind: 'income_lines.matched', ref: 'USNL1250031', data: { lines: 24, recording: 'night-bus' }, who: 'Jana' }))
      .toMatchObject({ kind: 'Edit', text: 'Matched 24 statement lines to night-bus', dept: 'Royalties' });
    expect(auditToActivity({ auditId: 'B', at, kind: 'department.updated', ref: 'royalties', data: { dept: 'Royalties', autonomy: 'suggest' }, who: 'Jana' }))
      .toMatchObject({ text: 'Set Royalties to Suggest', dept: 'Royalties' });
    expect(auditToActivity({ auditId: 'C', at, kind: 'something.new', ref: 'x', data: {}, who: 'Jana' }).text).toBe('something new x');
  });
  it('department states read in words', () => {
    expect(stateLabel('waitingOnYou')).toBe('waiting on you');
    expect(stateLabel('later')).toBe('coming later');
    expect(stateLabel('working')).toBe('working');
  });
});

describe('display names and repeated edits', () => {
  it('names a person by their name, else their catalog name, else their readable email', () => {
    expect(displayName('Jana Avery', 'Kesi Vale', 'x@y.z')).toBe('Jana Avery');
    expect(displayName(null, 'Kesi Vale', 'kesi@y.z')).toBe('Kesi Vale');
    expect(displayName(null, null, 'dana.okafor+e2e@northline.example')).toBe('Dana Okafor');
    expect(displayName('  ', null, null)).toBe('Someone');
  });
  it('folds rapid repeats of the same change by the same person into the newest, and keeps the rest', () => {
    const at = (m: number, s = 0) => new Date(Date.UTC(2026, 10, 6, 9, m, s));
    const row = (id: string, text: string) => ({ id, when: '', kind: 'Edit' as const, text, who: 'Jana', dept: 'Royalties', inputs: [], reasoning: '', output: '' });
    const rows = [
      { at: at(10, 50), key: 'jana|department.updated|royalties', row: row('a', 'Set Royalties to Suggest') },
      { at: at(10, 30), key: 'jana|recording.updated|night-bus', row: row('b', 'Edited recording night-bus') },
      { at: at(10, 20), key: 'jana|department.updated|royalties', row: row('c', 'Set Royalties to Observe') },
      { at: at(10, 0), key: 'jana|department.updated|royalties', row: row('d', 'Set Royalties to Draft and wait') },
      { at: at(1, 0), key: 'jana|department.updated|royalties', row: row('e', 'Set Royalties to Observe') }, // 9 minutes earlier: its own entry
      { at: at(0, 30), key: null, row: row('f', 'Agent run') },
    ];
    const out = collapseRepeats(rows);
    expect(out.map((r) => r.row.id)).toEqual(['a', 'b', 'e', 'f']);
    expect(out[0].row.text).toBe('Set Royalties to Suggest (the last of 3 changes in 1 minute)');
    expect(out[2].row.text).toBe('Set Royalties to Observe');
  });
});
