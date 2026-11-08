import { describe, expect, it } from 'vitest';
import { auditToActivity, stateLabel, whenLabel } from '../src/activity';

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
