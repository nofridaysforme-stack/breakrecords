import 'server-only';
import type { ApprovalChecksResponse, ApprovalState, ApprovalSummary, Decision, Proposal } from '@breakrecords/contract';
import { gate, runChecks, type CheckResult } from '@breakrecords/core/checks';
import { bulkApprove, decide, propose, undo, type ApprovalsState, type Outcome } from '@breakrecords/core/approvals';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { ApprovalDetail } from '@/data/types';
import { sql } from '../db';
import type { RequestContext } from '../context';
import type { ApprovalsBackend } from '../approvals';
import { liveFacts, todayIso } from './checks';

type Row = {
  id: string; origin: 'agent' | 'user'; type: ApprovalSummary['type']; title: string; agent: string; due: string; impact: string;
  risk: ApprovalSummary['risk']; context: string | null; risk_label: string | null; href: string | null; release_id: string | null;
  new_date: string | null; artists: string[] | null; releases: string[] | null; dept: string | null; detail: Record<string, unknown> | null; executed_at: Date | null;
};

const summary = (r: Row): ApprovalSummary => ({
  id: r.id, type: r.type, title: r.title, agent: r.agent, due: r.due, impact: r.impact, risk: r.risk,
  ...(r.context ? { context: r.context } : {}), ...(r.risk_label ? { riskLabel: r.risk_label } : {}),
});
const proposal = (r: Row): Proposal => ({
  ...summary(r), href: r.href ?? '/approvals',
  ...(r.release_id ? { releaseId: r.release_id } : {}), ...(r.new_date ? { newDate: r.new_date } : {}),
  ...(r.artists ? { artists: r.artists } : {}), ...(r.releases ? { releases: r.releases } : {}), ...(r.dept ? { dept: r.dept } : {}),
});

const rows = (tx: Tx) => tx<Row[]>`SELECT id, origin::text, type::text, title, agent, due, impact, risk::text, context, risk_label, href, release_id,
  to_char(new_date, 'YYYY-MM-DD') AS new_date, artists, releases, dept, detail, executed_at FROM approvals ORDER BY due_on NULLS LAST, created_at, id`;

async function readState(tx: Tx): Promise<{ state: ApprovalsState<Proposal>; all: Row[] }> {
  const all = await rows(tx);
  const ds = await tx<{ approval_id: string; status: Decision['status']; reason: string | null; decided_by: string | null; decided_at: Date; audit_id: string }[]>`
    SELECT approval_id, status::text, reason, decided_by, decided_at, audit_id FROM approval_decisions`;
  const decisions: Record<string, Decision> = Object.fromEntries(ds.map((d) => [d.approval_id, {
    status: d.status, at: d.decided_at.getTime(), ...(d.reason ? { reason: d.reason } : {}), ...(d.decided_by ? { by: d.decided_by } : {}), auditId: d.audit_id,
  }]));
  return { state: { decisions, proposals: all.filter((r) => r.origin === 'user').map(proposal) }, all };
}

/** Lists go in as JSON: postgres.js can't infer a type for an empty array. */
const textArray = (tx: Tx, v: string[] | undefined) =>
  v ? tx`ARRAY(SELECT jsonb_array_elements_text(${tx.json(v)}::jsonb))` : null;

const newAuditId = () => {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return `AUD-${[...b.slice(0, 2)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}-${String(((b[2] << 8) | b[3]) % 10000).padStart(4, '0')}`;
};

/** Applies a rule from packages/core to the stored state and writes only what changed. */
function mutate(ctx: RequestContext, run: (state: ApprovalsState<Proposal>, rules: Parameters<typeof decide>[3]) => Outcome<Proposal>): Promise<Outcome<Proposal>> {
  return withTenant(sql, ctx, async (tx) => {
    // One writer per tenant at a time, so two people deciding together can't race.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId}))`;
    const { state, all } = await readState(tx);
    const byId = new Map(all.map((r) => [r.id, r]));
    // The checks run again now, inside this transaction, on today's data.
    const checks = await checksIn(tx, all);
    const out = run(state, {
      find: (id) => byId.get(id) ?? state.proposals.find((p) => p.id === id),
      now: Date.now(), by: ctx.userId, newAuditId,
      executed: new Set(all.filter((r) => r.executed_at).map((r) => r.id)),
      checks: (id) => checks[id] ?? [],
    });
    if (!out.ok) return out;
    const next = out.state;
    const audit = (auditId: string, kind: string, ref: string, data: Record<string, unknown> = {}) =>
      tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data) VALUES (${ctx.tenantId}, ${auditId}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;

    for (const p of next.proposals) {
      const before = state.proposals.find((x) => x.id === p.id);
      if (before && JSON.stringify(before) === JSON.stringify(p)) continue;
      await tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, impact, risk, context, risk_label, href, release_id, new_date, artists, releases, dept, created_by)
        VALUES (${ctx.tenantId}, ${p.id}, 'user', ${p.type}, ${p.title}, ${p.agent}, ${p.due}, ${p.impact}, ${p.risk}, ${p.context ?? null}, ${p.riskLabel ?? null},
                ${p.href}, ${p.releaseId ?? null}, ${p.newDate ?? null}, ${textArray(tx, p.artists)}, ${textArray(tx, p.releases)}, ${p.dept ?? null}, ${ctx.userId})
        ON CONFLICT (tenant_id, id) DO UPDATE SET type = EXCLUDED.type, title = EXCLUDED.title, agent = EXCLUDED.agent, due = EXCLUDED.due, impact = EXCLUDED.impact,
          risk = EXCLUDED.risk, context = EXCLUDED.context, risk_label = EXCLUDED.risk_label, href = EXCLUDED.href, release_id = EXCLUDED.release_id,
          new_date = EXCLUDED.new_date, artists = EXCLUDED.artists, releases = EXCLUDED.releases, dept = EXCLUDED.dept
        WHERE approvals.origin = 'user'`;
      await audit(newAuditId(), 'approval.proposed', p.id, { title: p.title, type: p.type });
    }
    // Undone, or cleared by a re-proposal.
    for (const [id, d] of Object.entries(state.decisions)) {
      if (next.decisions[id]) continue;
      await tx`DELETE FROM approval_decisions WHERE approval_id = ${id}`;
      await audit(newAuditId(), 'approval.undone', id, { was: d.status });
    }
    // New decisions (each carries its own audit id).
    for (const [id, d] of Object.entries(next.decisions)) {
      if (state.decisions[id]?.auditId === d.auditId) continue;
      if (state.decisions[id]) await tx`DELETE FROM approval_decisions WHERE approval_id = ${id}`;
      await tx`INSERT INTO approval_decisions (tenant_id, approval_id, status, reason, decided_by, decided_at, audit_id)
        VALUES (${ctx.tenantId}, ${id}, ${d.status}, ${d.reason ?? null}, ${ctx.userId}, ${new Date(d.at)}, ${d.auditId!})`;
      // Every rule result goes into the log with the decision, with the inputs it read.
      const results = checks[id] ?? [];
      await audit(d.auditId!, `approval.${d.status}`, id, {
        ...(d.reason ? { [d.status === 'approved' ? 'acceptedWarnings' : 'reason']: d.reason } : {}),
        ...(results.length ? { checks: results.map((r) => ({ id: r.id, status: r.status, severity: r.severity, message: r.message, inputs: r.inputs })) } : {}),
      });
    }
    return { ok: true, state: (await readState(tx)).state, auditIds: out.auditIds };
  });
}

/** Each open agent card's checks, keyed by approval id. */
async function checksIn(tx: Tx, all: Row[]): Promise<Record<string, CheckResult[]>> {
  const facts = await liveFacts(tx);
  const today = todayIso();
  return Object.fromEntries(all.filter((r) => facts[r.id]).map((r) => [r.id, runChecks(r.type, facts[r.id], today)]));
}

export function liveChecks(ctx: RequestContext): Promise<ApprovalChecksResponse> {
  return withTenant(sql, ctx, async (tx) => {
    const all = await rows(tx);
    const checks = await checksIn(tx, all);
    return {
      today: todayIso(),
      items: Object.fromEntries(Object.entries(checks).map(([id, results]) => {
        const g = gate(results);
        return [id, { results, canApprove: !g.blocks.length, needsReason: g.warns.length > 0 }];
      })),
    };
  });
}

export function liveApprovals(ctx: RequestContext): ApprovalsBackend {
  return {
    checks: () => liveChecks(ctx),
    state: () => withTenant(sql, ctx, async (tx) => (await readState(tx)).state satisfies ApprovalState),
    decide: (id, cmd) => mutate(ctx, (s, r) => decide(s, id, cmd, r)),
    bulkApprove: (ids) => mutate(ctx, (s, r) => bulkApprove(s, ids, r)),
    undo: (ids) => mutate(ctx, (s, r) => undo(s, ids, r)),
    propose: (p) => mutate(ctx, (s) => propose(s, p)),
  };
}

/** Agent-prepared approvals for this tenant, in due order. */
export function liveApprovalItems(ctx: RequestContext): Promise<ApprovalSummary[]> {
  return withTenant(sql, ctx, async (tx) => (await rows(tx)).filter((r) => r.origin === 'agent').map(summary));
}

/** One approval with what the person is shown, or null. */
export function liveApprovalDetail(ctx: RequestContext, id: string): Promise<ApprovalDetail | null> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = (await rows(tx)).filter((x) => x.id === id);
    return r?.detail ? ({ ...summary(r), ...r.detail } as ApprovalDetail) : null;
  });
}
