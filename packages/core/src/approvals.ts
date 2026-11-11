// Approval rules (flows.md > Approval rules), enforced by whichever server sits behind the API.
// Pure functions over a plain state object: the mock keeps it in memory, the live server in
// Postgres. Nothing here executes the approved action; that is a separate, later step.
// Each card's checks (./checks) gate approving: a failed Block rule refuses it, and a failed
// Warn rule needs a typed reason.
import { gate, type CheckResult } from './checks';

export type ApprovalKind = 'money' | 'signature' | 'filing' | 'public' | 'plan';
export type RiskLevel = 'low' | 'dueSoon' | 'needsEyes' | 'blocked';
export type ApprovalItem = { id: string; type: ApprovalKind; risk: RiskLevel };
export type DecisionRecord = { status: 'approved' | 'rejected'; at: number; reason?: string; by?: string; auditId?: string };
export type ApproveCommand = { action: 'approve'; acceptWarnings?: string };
export type ProposalItem = ApprovalItem & Record<string, unknown>;
export type ApprovalsState<P extends ProposalItem = ProposalItem> = { decisions: Record<string, DecisionRecord>; proposals: P[] };

export type ApprovalErrorCode = 'invalid' | 'not_found' | 'reason_required' | 'not_bulk_approvable' | 'blocked' | 'already_executed';
export type Outcome<P extends ProposalItem> =
  | { ok: true; state: ApprovalsState<P>; auditIds: string[] }
  | { ok: false; error: ApprovalErrorCode; message: string; ids?: string[] };

type Ctx = {
  /** Server items and proposals, so rules can see type and risk. */
  find: (id: string) => ApprovalItem | undefined;
  now: number;
  by: string;
  /** Ids whose action already ran; those can no longer be undone. */
  executed?: ReadonlySet<string>;
  newAuditId: () => string;
  /** The card's checks, run now (so they see today's data). */
  checks?: (id: string) => CheckResult[];
};

/** Low risk only, never signatures. */
export const canBulkApprove = (a: ApprovalItem) => a.risk === 'low' && a.type !== 'signature';

export function decide<P extends ProposalItem>(
  state: ApprovalsState<P>, id: string, cmd: ApproveCommand | { action: 'reject'; reason: string }, ctx: Ctx,
): Outcome<P> {
  const item = ctx.find(id);
  if (!item) return { ok: false, error: 'not_found', message: `No approval ${id}.` };
  if (ctx.executed?.has(id)) return { ok: false, error: 'already_executed', message: 'This already went ahead, so it can’t be changed here.' };
  const current = state.decisions[id];
  const target = cmd.action === 'approve' ? 'approved' : 'rejected';
  if (current?.status === target) return { ok: true, state, auditIds: current.auditId ? [current.auditId] : [] }; // idempotent
  if (current) return { ok: false, error: 'invalid', message: `This is already ${current.status}. Undo it first.` };
  if (cmd.action === 'reject' && !cmd.reason?.trim()) return { ok: false, error: 'reason_required', message: 'A rejection needs a reason.' };
  if (cmd.action === 'approve' && item.risk === 'blocked') return { ok: false, error: 'blocked', message: 'This is blocked. Fix what’s missing first.' };
  let accepted: string | undefined;
  if (cmd.action === 'approve') {
    const { blocks, warns } = gate(ctx.checks?.(id) ?? []);
    if (blocks.length) return { ok: false, error: 'blocked', message: `Can’t approve yet. ${blocks.map((b) => `${b.id}: ${b.message}`).join(' ')}`, ids: [id] };
    accepted = cmd.acceptWarnings?.trim();
    if (warns.length && !accepted) return { ok: false, error: 'reason_required', message: `Say why you’re accepting ${warns.length === 1 ? 'the warning' : `${warns.length} warnings`} (${warns.map((w) => w.id).join(', ')}).`, ids: [id] };
  }
  const auditId = ctx.newAuditId();
  const decision: DecisionRecord = {
    status: target, at: ctx.now, by: ctx.by, auditId,
    ...(cmd.action === 'reject' ? { reason: cmd.reason.trim() } : accepted ? { reason: accepted } : {}),
  };
  return { ok: true, state: { ...state, decisions: { ...state.decisions, [id]: decision } }, auditIds: [auditId] };
}

/** All or nothing: if any item can't be bulk approved, nothing is approved. */
export function bulkApprove<P extends ProposalItem>(state: ApprovalsState<P>, ids: string[], ctx: Ctx): Outcome<P> {
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !ctx.find(id));
  if (missing.length) return { ok: false, error: 'not_found', message: 'Some approvals don’t exist.', ids: missing };
  const refused = unique.filter((id) => !canBulkApprove(ctx.find(id)!));
  if (refused.length) return { ok: false, error: 'not_bulk_approvable', message: 'Only low-risk items can be approved together, and signatures never.', ids: refused };
  // A card with any failed check is approved on its own, where its reasons are shown.
  const failing = unique.filter((id) => { const g = gate(ctx.checks?.(id) ?? []); return g.blocks.length || g.warns.length; });
  if (failing.length) return { ok: false, error: 'blocked', message: 'Some of these have failed checks. Open each one to see why.', ids: failing };
  let next = state; const auditIds: string[] = [];
  for (const id of unique) {
    const r = decide(next, id, { action: 'approve' }, ctx);
    if (!r.ok) return r;
    next = r.state; auditIds.push(...r.auditIds);
  }
  return { ok: true, state: next, auditIds };
}

/** Undo is allowed until the action executes (flows.md > Motion: "where the action isn't yet irreversible"). */
export function undo<P extends ProposalItem>(state: ApprovalsState<P>, ids: string[], ctx: Ctx): Outcome<P> {
  const ran = ids.filter((id) => ctx.executed?.has(id));
  if (ran.length) return { ok: false, error: 'already_executed', message: 'Some of these already went ahead and can’t be undone.', ids: ran };
  const decisions = { ...state.decisions };
  ids.forEach((id) => delete decisions[id]);
  return { ok: true, state: { ...state, decisions }, auditIds: [] };
}

/** Adds or replaces a proposal. A re-proposed item needs a fresh decision. */
export function propose<P extends ProposalItem>(state: ApprovalsState<P>, proposal: P): Outcome<P> {
  const decisions = { ...state.decisions };
  delete decisions[proposal.id];
  return { ok: true, state: { decisions, proposals: [...state.proposals.filter((p) => p.id !== proposal.id), proposal] }, auditIds: [] };
}
