import 'server-only';
import { auditToActivity, stateLabel, whenLabel, type DeptState } from '@breakrecords/core/activity';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { Departments } from '@/data/api';
import type { ActivityEvent } from '@/data/ops';
import type { Autonomy } from '@/components/ui/AutonomyDial';
import { sql } from '../db';
import type { RequestContext } from '../context';

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const display = (name: string | null, email: string) => name ?? email.split('@')[0];

async function teamIn(tx: Tx) {
  const rows = await tx<{ user_id: string; name: string | null; email: string; role: string; title: string | null }[]>`SELECT * FROM app_team()`;
  return rows.map((r) => ({ id: r.user_id, name: display(r.name, r.email), role: r.title ?? (r.role === 'owner' ? 'Owner' : 'Team') }));
}

async function departmentsIn(tx: Tx): Promise<Departments> {
  const rows = await tx<{ slug: string; name: string; agent: string | null; phase: 1 | 2; autonomy: Autonomy | null; can_act: boolean; act_note: string;
    spend_cap_cents: string | null; person_id: string | null; state: DeptState; tasks_this_week: number | null }[]>`
    SELECT slug, name, agent, phase, autonomy::text AS autonomy, can_act, act_note, spend_cap_cents, person_id, state::text AS state, tasks_this_week
    FROM departments ORDER BY position, name`;
  return {
    departments: rows.map((d) => ({
      id: d.slug, name: d.name, agent: d.agent ?? 'Not active', state: d.state, stateLabel: stateLabel(d.state), autonomy: d.autonomy,
      tasks: d.tasks_this_week, spendCap: n(d.spend_cap_cents), phase: d.phase, canAct: d.can_act, actNote: d.act_note, personId: d.person_id,
    })),
    team: await teamIn(tx),
  };
}

/** Departments (5f) and the team, for the signed-in tenant. */
export function liveDepartments(ctx: RequestContext): Promise<Departments> {
  return withTenant(sql, ctx, departmentsIn);
}

export type DeptWrite = { ok: true; value: Departments } | { ok: false; status: number; error: 'not_found' | 'not_allowed' | 'not_on_team'; message: string };

/**
 * Changes a department's autonomy or who it's handed to. "Act within limits" is refused for
 * departments whose work is money, signatures or filings (the database enforces it too).
 */
export function liveUpdateDepartment(ctx: RequestContext, slug: string, c: { autonomy?: Autonomy; personId?: string | null }): Promise<DeptWrite> {
  return withTenant(sql, ctx, async (tx) => {
    const [d] = await tx<{ name: string; phase: number; can_act: boolean; act_note: string }[]>`SELECT name, phase, can_act, act_note FROM departments WHERE slug = ${slug}`;
    if (!d) return { ok: false, status: 404, error: 'not_found', message: 'No such department.' } as const;
    if (d.phase === 2) return { ok: false, status: 409, error: 'not_allowed', message: `${d.name} arrives in Phase 2.` } as const;
    if (c.autonomy === 'act_within_limits' && !d.can_act) return { ok: false, status: 409, error: 'not_allowed', message: d.act_note || `${d.name} always waits for you.` } as const;
    const team = await teamIn(tx);
    const person = c.personId ? team.find((t) => t.id === c.personId) : null;
    if (c.personId && !person) return { ok: false, status: 409, error: 'not_on_team', message: 'That person isn’t on your team.' } as const;
    if (c.autonomy !== undefined) await tx`UPDATE departments SET autonomy = ${c.autonomy} WHERE slug = ${slug}`;
    if (c.personId !== undefined) await tx`UPDATE departments SET person_id = ${c.personId} WHERE slug = ${slug}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-DPT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'department.updated', ${slug},
              ${tx.json({ dept: d.name, ...(c.autonomy !== undefined ? { autonomy: c.autonomy } : {}), ...(c.personId !== undefined ? { person: person?.name ?? null } : {}) })})`;
    return { ok: true, value: await departmentsIn(tx) } as const;
  });
}

/** The activity log (5g): what agents reported, and every audited change people made, newest first. */
export function liveActivity(ctx: RequestContext): Promise<ActivityEvent[]> {
  return withTenant(sql, ctx, async (tx) => {
    const agents = await tx<{ id: string; occurred_at: Date; kind: ActivityEvent['kind']; text: string; who: string; dept: string; inputs: string[]; reasoning: string; output: string }[]>`
      SELECT id, occurred_at, kind::text AS kind, text, who, dept, inputs, reasoning, output FROM agent_events ORDER BY occurred_at DESC LIMIT 200`;
    const people = await tx<{ audit_id: string; at: Date; kind: string; ref: string; data: Record<string, unknown>; name: string | null; email: string | null; title: string | null }[]>`
      SELECT e.audit_id, e.at, e.kind, e.ref, e.data, u.name, u.email, a.title
      FROM audit_events e LEFT JOIN users u ON u.id = e.actor LEFT JOIN approvals a ON a.tenant_id = e.tenant_id AND a.id = e.ref AND e.kind LIKE 'approval.%'
      ORDER BY e.at DESC, e.id DESC LIMIT 200`;
    const rows = [
      ...agents.map((a) => ({ at: a.occurred_at, row: { id: a.id, when: whenLabel(a.occurred_at), kind: a.kind, text: a.text, who: a.who, dept: a.dept, inputs: a.inputs, reasoning: a.reasoning, output: a.output } })),
      ...people.map((p) => ({ at: p.at, row: auditToActivity({ auditId: p.audit_id, at: p.at, kind: p.kind, ref: p.ref, data: p.data, who: p.email ? display(p.name, p.email) : 'Someone', approvalTitle: p.title }) })),
    ];
    return rows.sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 200).map((r) => r.row);
  });
}
