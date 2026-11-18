import 'server-only';
import type { z } from 'zod';
import type { PlanDraftResponse, PlansResponse } from '@breakrecords/contract';
import { labelHeadPlan, planProgress, type OpenFinding, type PlanStep } from '@breakrecords/core/labelHead';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveApprovals } from '../live/approvals';

// Label Head plans from what the agents have open. Drafting changes nothing; approving saves the
// plan with an approved plan card, built again on the server from the goal (never from the page).

type Draft = z.infer<typeof PlanDraftResponse>;
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

async function openFindings(tx: Tx): Promise<{ open: OpenFinding[]; ran: boolean }> {
  const open = await tx<{ key: string; dept: string; agent: string | null; rule: string; title: string; href: string | null; approval_id: string | null }[]>`
    SELECT f.key, f.dept, d.agent, f.rule, f.title, f.href, f.approval_id
    FROM agent_findings f JOIN departments d ON d.tenant_id = f.tenant_id AND d.slug = f.dept
    WHERE f.status = 'open' ORDER BY f.approval_id IS NULL, f.first_seen, f.key`;
  const [{ ran }] = await tx<{ ran: boolean }[]>`SELECT EXISTS (SELECT 1 FROM agent_runs WHERE finished_at IS NOT NULL) AS ran`;
  return { open: open.map((f) => ({ key: f.key, dept: f.dept, agent: f.agent ?? f.dept, rule: f.rule, title: f.title, href: f.href, approvalId: f.approval_id })), ran };
}

async function draftIn(tx: Tx, goal: string): Promise<Draft> {
  const { open, ran } = await openFindings(tx);
  return { goal, ...labelHeadPlan(goal, open, ran) };
}

export function liveDraftPlan(ctx: RequestContext, goal: string): Promise<Draft> {
  return withTenant(sql, ctx, (tx) => draftIn(tx, goal));
}

export type PlanWrite = { ok: true; id: string } | { ok: false; status: number; error: 'empty' | 'conflict'; message: string };

/** Approves a goal's plan: a plan card proposed by the Label Head and approved by this person, and the plan saved. */
export async function liveApprovePlan(ctx: RequestContext, goal: string): Promise<PlanWrite> {
  const draft = await liveDraftPlan(ctx, goal);
  const steps: PlanStep[] = draft.phases.flatMap((p) => p.steps);
  if (!steps.length) return { ok: false, status: 409, error: 'empty', message: draft.empty ?? 'There’s nothing to plan for that goal yet.' };
  const base = `plan_${draft.area}_${goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'goal'}`;
  const [{ n }] = await withTenant(sql, ctx, (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM approvals WHERE id = ${base} OR id LIKE ${base + '_%'}`);
  const id = n ? `${base}_${n + 1}` : base;
  const approvals = liveApprovals(ctx);
  const proposed = await approvals.propose({ id, type: 'plan', title: draft.title, agent: 'Label Head', due: 'This week', impact: `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
    risk: 'low', riskLabel: 'Plan', context: `Goal: ${goal}`, href: '/plan', dept: 'Label Head' });
  if (!proposed.ok) return { ok: false, status: 409, error: 'conflict', message: proposed.message };
  const decided = await approvals.decide(id, { action: 'approve' });
  if (!decided.ok) return { ok: false, status: 409, error: 'conflict', message: decided.message };
  await withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO plans (tenant_id, id, goal, area, title, steps, approval_id, created_by)
      VALUES (${ctx.tenantId}, ${id}, ${goal}, ${draft.area}, ${draft.title}, ${tx.json(steps as never)}, ${id}, ${ctx.userId})`;
  });
  return { ok: true, id };
}

/** Approved plans, newest first; a step is done once its finding is no longer open. */
export function livePlans(ctx: RequestContext): Promise<z.infer<typeof PlansResponse>> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ id: string; goal: string; title: string; steps: PlanStep[]; created_at: Date }[]>`SELECT id, goal, title, steps, created_at FROM plans ORDER BY created_at DESC LIMIT 20`;
    const open = new Set((await tx<{ key: string }[]>`SELECT key FROM agent_findings WHERE status = 'open'`).map((r) => r.key));
    return {
      live: true,
      plans: rows.map((p) => {
        const progress = planProgress(p.steps.map((s) => s.key), open);
        return { id: p.id, goal: p.goal, title: p.title, approved: day(p.created_at), ...progress, steps: p.steps.map((s) => ({ ...s, done: !open.has(s.key) })) };
      }),
    };
  });
}
