import 'server-only';
import { NextResponse } from 'next/server';
import type { ApprovalError, ApprovalState, Proposal } from '@breakrecords/contract';
import { bulkApprove, decide, propose, undo, type Outcome } from '@breakrecords/core/approvals';
import { approvals as serverItems } from '@/data/sample';
import { isLive, ModuleNotLive } from './modules';
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

export async function approvalsBackend(): Promise<ApprovalsBackend> {
  if (isLive('approvals')) throw new ModuleNotLive('approvals');
  return mock(await mockSession());
}

const STATUS: Record<ApprovalError['error'], number> = {
  invalid: 400, reason_required: 400, not_found: 404, not_bulk_approvable: 409, blocked: 409, already_executed: 409, module_not_live: 503,
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
    if (e instanceof ModuleNotLive) return errorResponse('module_not_live', e.message);
    throw e;
  }
}
