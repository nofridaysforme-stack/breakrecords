import { describe, expect, it } from 'vitest';
import { bulkApprove, decide, propose, undo, type ApprovalItem, type ApprovalsState } from '../src/approvals';

const items: ApprovalItem[] = [
  { id: 'pay', type: 'money', risk: 'low' },
  { id: 'sign', type: 'signature', risk: 'needsEyes' },
  { id: 'file', type: 'filing', risk: 'low' },
  { id: 'stuck', type: 'money', risk: 'blocked' },
];
let n = 0;
const ctx = (executed: string[] = []) => ({ find: (id: string) => items.find((i) => i.id === id), now: 1000, by: 'you', executed: new Set(executed), newAuditId: () => `AUD-${++n}` });
const empty: ApprovalsState = { decisions: {}, proposals: [] };

describe('approval rules', () => {
  it('approves once, and approving again is a no-op', () => {
    const a = decide(empty, 'pay', { action: 'approve' }, ctx());
    expect(a.ok && a.state.decisions.pay.status).toBe('approved');
    const b = a.ok ? decide(a.state, 'pay', { action: 'approve' }, ctx()) : a;
    expect(b.ok && b.state).toBe(a.ok && a.state);
  });
  it('a rejection needs a reason', () => {
    expect(decide(empty, 'sign', { action: 'reject', reason: '  ' }, ctx())).toMatchObject({ ok: false, error: 'reason_required' });
    const r = decide(empty, 'sign', { action: 'reject', reason: 'Clause 4.2' }, ctx());
    expect(r.ok && r.state.decisions.sign).toMatchObject({ status: 'rejected', reason: 'Clause 4.2', by: 'you' });
  });
  it('a blocked item cannot be approved', () => {
    expect(decide(empty, 'stuck', { action: 'approve' }, ctx())).toMatchObject({ ok: false, error: 'blocked' });
  });
  it('switching a decision needs an undo first', () => {
    const a = decide(empty, 'pay', { action: 'approve' }, ctx());
    expect(a.ok && decide(a.state, 'pay', { action: 'reject', reason: 'x' }, ctx())).toMatchObject({ ok: false, error: 'invalid' });
  });
  it('bulk approve refuses signatures and is all or nothing', () => {
    const r = bulkApprove(empty, ['pay', 'sign'], ctx());
    expect(r).toMatchObject({ ok: false, error: 'not_bulk_approvable', ids: ['sign'] });
    const ok = bulkApprove(empty, ['pay', 'file'], ctx());
    expect(ok.ok && Object.keys(ok.state.decisions).sort()).toEqual(['file', 'pay']);
  });
  it('undo works until the action executes', () => {
    const a = decide(empty, 'pay', { action: 'approve' }, ctx());
    if (!a.ok) throw new Error();
    expect(undo(a.state, ['pay'], ctx()).ok && 'undone').toBe('undone');
    expect(undo(a.state, ['pay'], ctx(['pay']))).toMatchObject({ ok: false, error: 'already_executed' });
    expect(decide(a.state, 'pay', { action: 'approve' }, ctx(['pay']))).toMatchObject({ ok: false, error: 'already_executed' });
  });
  it('re-proposing clears the earlier decision', () => {
    const p = { id: 'plan', type: 'plan' as const, risk: 'dueSoon' as const };
    const s1 = propose(empty, p); if (!s1.ok) throw new Error();
    const s2 = decide(s1.state, 'plan', { action: 'approve' }, { ...ctx(), find: () => p }); if (!s2.ok) throw new Error();
    const s3 = propose(s2.state, p);
    expect(s3.ok && s3.state.decisions.plan).toBeUndefined();
    expect(s3.ok && s3.state.proposals).toHaveLength(1);
  });
});
