import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { ApprovalChecksResponse, ApprovalError, ApprovalState, Proposal } from '@breakrecords/contract';
import { bulkApprove, decide, propose, undo, type ApproveCommand, type Outcome } from '@breakrecords/core/approvals';
import { gate, runChecks } from '@breakrecords/core/checks';
import { mockFacts, mockProposalFacts } from '@/data/checkFacts';
import { TODAY } from '@/data/fixtures';
import { approvals as serverItems } from '@/data/sample';
import { isLive } from './modules';
import { authRequired, getContext } from './context';
import { liveApprovals } from './live/approvals';
import { mockSession } from './session';

/** What any approvals backend must do. The mock below and the live one (Stage 1) share it. */
export interface ApprovalsBackend {
  state(): Promise<ApprovalState>;
  /** Each open card's checks, run now. */
  checks(): Promise<ApprovalChecksResponse>;
  decide(id: string, cmd: ApproveCommand | { action: 'reject'; reason: string }): Promise<Outcome<Proposal>>;
  bulkApprove(ids: string[]): Promise<Outcome<Proposal>>;
  undo(ids: string[]): Promise<Outcome<Proposal>>;
  propose(p: Proposal): Promise<Outcome<Proposal>>;
}

// ---------- mock: in memory, one state per browser session ----------
/**
 * The sample label's checks. Sample data keeps its fixed date (TODAY), like every other mock
 * screen. The sample cards fail several checks on purpose; tests of the approve flow itself
 * turn checks off for their browser with the `br_checks=off` cookie (sample data only, never live).
 */
const mockChecks = (off = false, proposals: Proposal[] = []) => off ? {} : Object.fromEntries([
  ...serverItems.filter((a) => mockFacts[a.id]).map((a) => [a.id, runChecks(a.type, mockFacts[a.id], TODAY.iso)] as const),
  // Proposals made in the app (a release date plan, accepting an offer) are checked too.
  ...proposals.flatMap((p) => { const f = mockProposalFacts(p); return f ? [[p.id, runChecks(p.type, f, TODAY.iso)] as const] : []; }),
]);
const g = globalThis as unknown as { __brApprovals?: Map<string, ApprovalState> };
const sessions = (g.__brApprovals ??= new Map());

function mock(sessionId: string, checksOff = false): ApprovalsBackend {
  const read = (): ApprovalState => sessions.get(sessionId) ?? { decisions: {}, proposals: [] };
  const ctx = () => {
    const s = read();
    return {
      find: (id: string) => serverItems.find((a) => a.id === id) ?? s.proposals.find((p) => p.id === id),
      now: Date.now(), by: 'you',
      // The mock never executes anything, so every decision can be undone.
      executed: new Set<string>(),
      newAuditId: () => `AUD-MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      checks: (id: string) => mockChecks(checksOff, s.proposals)[id] ?? [],
    };
  };
  const commit = (o: Outcome<Proposal>) => { if (o.ok) sessions.set(sessionId, o.state); return o; };
  return {
    state: async () => read(),
    checks: async () => ({
      today: TODAY.iso,
      items: Object.fromEntries(Object.entries(mockChecks(checksOff, read().proposals)).map(([id, results]) => {
        const g = gate(results);
        return [id, { results, canApprove: !g.blocks.length, needsReason: g.warns.length > 0 }];
      })),
    }),
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
  return mock(await mockSession(), (await cookies()).get('br_checks')?.value === 'off');
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
