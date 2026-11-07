import 'server-only';
import { NextResponse } from 'next/server';
import type { ApprovalError, ApprovalState, Proposal } from '@breakrecords/contract';
import { bulkApprove, decide, propose, undo, type Outcome } from '@breakrecords/core/approvals';
import { approvals as serverItems } from '@/data/sample';
import { isLive } from './modules';
import { authRequired, getContext } from './context';
import { liveApprovals } from './live/approvals';
import { mockSession } from './session';

/** What any approvals backend must do. The mock below and the live one (Stage 1) share it. */
export interface ApprovalsBackend {
  state(): Promise<ApprovalState>;
  decide(id: string, cmd: { action: 'approve' } | { action: 'reject'; reason: string }): Promise<Outcome<Proposal>>;
  bulkApprove(ids: string[]): Promise<Outcome<Proposal>>;
  undo(ids: string[]): Promise<Outcome<Proposal>>;
  propose(p: Proposal): Promise<Outcome<Proposal>>;
}

// ---------- mock: in memory, one state per browser session ----------
const g = globalThis as unknown as { __brApprovals?: Map<string, ApprovalState> };
const sessions = (g.__brApprovals ??= new Map());

function mock(sessionId: string): ApprovalsBackend {
  const read = (): ApprovalState => sessions.get(sessionId) ?? { decisions: {}, proposals: [] };
  const ctx = () => {
    const s = read();
    return {
      find: (id: string) => serverItems.find((a) => a.id === id) ?? s.proposals.find((p) => p.id === id),
      now: Date.now(), by: 'you',
      // The mock never executes anything, so every decision can be undone.
      executed: new Set<string>(),
      newAuditId: () => `AUD-MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    };
  };
  const commit = (o: Outcome<Proposal>) => { if (o.ok) sessions.set(sessionId, o.state); return o; };
  return {
    state: async () => read(),
    decide: async (id, cmd) => commit(decide(read(), id, cmd, ctx())),
    bulkApprove: async (ids) => commit(bulkApprove(read(), ids, ctx())),
    undo: async (ids) => commit(undo(read(), ids, ctx())),
    propose: async (p) => commit(propose(read(), p)),
  };
}

export class Unauthorized extends Error {}
export class Forbidden extends Error {}

/** Live when the module is flipped (and the request is signed in); otherwise the mock. */
export async function approvalsBackend(): Promise<ApprovalsBackend> {
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) throw new Unauthorized();
    if (ctx.role === 'payee') throw new Forbidden();
    if (isLive('approvals')) return liveApprovals(ctx);
  }
  return mock(await mockSession());
}

const STATUS: Record<ApprovalError['error'], number> = {
  invalid: 400, reason_required: 400, unauthorized: 401, forbidden: 403, not_found: 404, not_bulk_approvable: 409, blocked: 409, already_executed: 409, module_not_live: 503,
};

export function errorResponse(error: ApprovalError['error'], message: string, ids?: string[]) {
  return NextResponse.json({ error, message, ...(ids ? { ids } : {}) } satisfies ApprovalError, { status: STATUS[error] });
}

/** Runs a handler, mapping refusals and a missing live backend to the contract's error shape. */
export async function handle(run: (b: ApprovalsBackend) => Promise<Outcome<Proposal> | ApprovalState>) {
  try {
    const out = await run(await approvalsBackend());
    if ('ok' in out) return out.ok ? NextResponse.json(out.state satisfies ApprovalState) : errorResponse(out.error, out.message, out.ids);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof Unauthorized) return errorResponse('unauthorized', 'Sign in to continue.');
    if (e instanceof Forbidden) return errorResponse('forbidden', 'Only the label’s owner and team can see or decide approvals.');
    throw e;
  }
}
