// The activity log (5g) and departments (5f): how an audit entry reads as an activity row, and
// how department and time labels read. Pure, shared by the live server and tests.
import { dayMonth } from './payouts';

export type ActivityKind = 'Agent run' | 'Flag' | 'Error' | 'Approval' | 'Tool call' | 'Edit';
export type ActivityRow = { id: string; when: string; kind: ActivityKind; text: string; who: string; dept: string; inputs: string[]; reasoning: string; output: string };
export type DeptState = 'idle' | 'working' | 'waitingOnYou' | 'blocked' | 'done' | 'later';

/** "Nov 6, 9:12", in UTC so every viewer sees the same time. */
export function whenLabel(at: Date): string {
  return `${dayMonth(at)}, ${at.getUTCHours()}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}

export const stateLabel = (s: DeptState) => (s === 'waitingOnYou' ? 'waiting on you' : s === 'later' ? 'coming later' : s);

const LEVEL = { observe: 'Observe', suggest: 'Suggest', draft_and_wait: 'Draft and wait', act_within_limits: 'Act within limits' } as Record<string, string>;
type Data = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** What each kind of audit entry says, and which department it belongs to. */
const READ: Record<string, (ref: string, d: Data, title: string) => [text: string, dept: string]> = {
  'approval.approved': (_r, _d, t) => [`Approved ${t}`, 'Approvals'],
  'approval.rejected': (_r, d, t) => [`Rejected ${t}${d.reason ? `: "${str(d.reason)}"` : ''}`, 'Approvals'],
  'approval.undone': (_r, _d, t) => [`Undid the decision on ${t}`, 'Approvals'],
  'approval.proposed': (_r, _d, t) => [`Proposed ${t}`, 'Approvals'],
  'income_lines.matched': (_r, d) => [`Matched ${str(d.lines)} statement lines to ${str(d.recording)}`, 'Royalties'],
  'payee_request.created': (r, d) => [`Asked ${r} for ${d.kind === 'tax_form' ? 'a tax form' : 'new bank details'}`, 'Finance'],
  'recoupable_cost.added': (r, d) => [`Added ${str(d.category)} to ${r} recoupment`, 'Finance'],
  'contract_review.requested': (_r, d) => [`Sent ${str(d.fileName)} to Legal Agent for review`, 'Legal'],
  'split.draft_edited': (r) => [`Edited the ${r} split draft`, 'Legal'],
  'split.sent': (r) => [`Sent the ${r} split for signatures`, 'Legal'],
  'split.signed': (r, d) => [`Signed the ${r} split${d.role ? ` as ${str(d.role)}` : ''}`, 'Legal'],
  'profile_claims.prepared': (_r, d) => [`Prepared ${str(d.count)} profile claims`, 'Rights'],
  'recording.updated': (r) => [`Edited recording ${r}`, 'Metadata'],
  'funding.dismissed': (r) => [`Dismissed ${r}`, 'Funding'],
  'funding.restored': (r) => [`Brought back ${r}`, 'Funding'],
  'funding.declined': (r) => [`Declined ${r}`, 'Funding'],
  'funding.undeclined': (r) => [`Undid declining ${r}`, 'Funding'],
  'funding.question': (_r, d) => [`Asked the offerers: "${str(d.question)}"`, 'Funding'],
  'department.updated': (_r, d) => [d.autonomy ? `Set ${str(d.dept)} to ${LEVEL[str(d.autonomy)] ?? str(d.autonomy)}` : `Handed ${str(d.dept)} to ${str(d.person) || 'nobody'}`, str(d.dept) || 'Settings'],
};

/** An audit entry (something a person did in the app) as a row in the activity log. */
export function auditToActivity(e: { auditId: string; at: Date; kind: string; ref: string; data: Data; who: string; approvalTitle?: string | null }): ActivityRow {
  const read = READ[e.kind];
  const [text, dept] = read ? read(e.ref, e.data, e.approvalTitle ?? e.ref) : [`${e.kind.replace(/[._]/g, ' ')} ${e.ref}`, 'Settings'];
  return {
    id: e.auditId, when: whenLabel(e.at), kind: e.kind.startsWith('approval.') ? 'Approval' : 'Edit', text, who: e.who, dept,
    inputs: [e.ref], reasoning: `Done by ${e.who} in the app.`, output: `Recorded in the audit log as ${e.auditId}.`,
  };
}
