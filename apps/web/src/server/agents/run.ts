import 'server-only';
import type { z } from 'zod';
import type { AgentsResponse } from '@breakrecords/contract';
import { deptState, planRun, runSummary, type Dept, type Finding, type StoredFinding } from '@breakrecords/core/agents';
import { auditFindings, metadataFindings, rightsFindings, royaltiesFindings, type AuditFacts, type MetadataFacts, type RegNext, type RightsFacts, type RoyaltiesFacts } from '@breakrecords/core/agentRules';
import { personMissing } from '@breakrecords/core/people';
import { regState, type RegOrg, type RegStatus } from '@breakrecords/core/registrations';
import type { Person } from '@breakrecords/core/documents';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveRegistrationAction } from '../live/rights';

// The agents' runner: loads the label's facts, asks each agent's rules what they notice, and
// carries out what the department's autonomy allows. Rules only, no AI. Runs from the schedule
// (every workspace) or from Run now (one workspace).

export type RunResult = { found: number; closed: number; proposed: number; fixed: number; errors: string[] };

const ACTIVE = ['metadata', 'rights', 'royalties', 'audit'] as const;
const DEPT_NAME: Record<string, string> = { metadata: 'Metadata', rights: 'Rights', royalties: 'Royalties', audit: 'Audit' };
const INPUTS: Record<string, string[]> = {
  metadata: ['Catalog', 'People'], rights: ['Catalog', 'Registrations', 'Unclaimed money'],
  royalties: ['Statements', 'Splits', 'Payouts'], audit: ['Statements', 'Reserves'],
};

async function royaltiesFacts(tx: Tx): Promise<RoyaltiesFacts> {
  const unmatched = await tx<{ isrc: string | null; lines: number; cents: string; rec_id: string | null; rec_title: string | null }[]>`
    SELECT u.isrc, u.lines, u.cents, r.slug AS rec_id, r.title AS rec_title FROM (
      SELECT nullif(upper(regexp_replace(coalesce(l.isrc, ''), '[^A-Za-z0-9]', '', 'g')), '') AS isrc, count(*)::int AS lines, sum(l.amount_cents) AS cents
      FROM income_lines l WHERE l.recording_id IS NULL AND l.work_id IS NULL GROUP BY 1
    ) u LEFT JOIN recordings r ON r.isrc = u.isrc ORDER BY u.cents DESC`;
  const unsplit = await tx<{ id: string; title: string; cents: string }[]>`
    SELECT rl.slug AS id, rl.title, sum(l.amount_cents) AS cents
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id
    JOIN release_tracks t ON t.recording_id = l.recording_id JOIN releases rl ON rl.id = t.release_id
    WHERE s.period >= date_trunc('month', current_date) - interval '4 months'
      AND NOT EXISTS (SELECT 1 FROM split_nodes n WHERE n.release_id = rl.id)
    GROUP BY rl.slug, rl.title HAVING sum(l.amount_cents) > 0 ORDER BY 3 DESC`;
  const draftBatches = await tx<{ id: string; name: string }[]>`
    SELECT slug AS id, name FROM payout_batches WHERE status = 'draft' AND approval_id IS NULL AND period < date_trunc('month', current_date) ORDER BY period`;
  return {
    unmatched: unmatched.map((u) => ({ isrc: u.isrc, lines: u.lines, cents: Number(u.cents), recording: u.rec_id ? { id: u.rec_id, title: u.rec_title! } : null })),
    unsplit: unsplit.map((r) => ({ id: r.id, title: r.title, cents: Number(r.cents) })),
    draftBatches,
  };
}

async function auditFacts(tx: Tx): Promise<AuditFacts> {
  // Plays per recording per month; the latest month on file against the up-to-3 months before it.
  const units = await tx<{ id: string; title: string; latest: string; average: string | null; months: number; flagged: boolean }[]>`
    WITH m AS (
      SELECT l.recording_id, s.period, sum(coalesce(l.units, 0)) AS units
      FROM income_lines l JOIN income_statements s ON s.id = l.statement_id WHERE l.recording_id IS NOT NULL GROUP BY 1, 2
    ), last AS (SELECT max(period) AS period FROM m)
    SELECT r.slug AS id, r.title, cur.units AS latest,
           (SELECT avg(p.units) FROM m p WHERE p.recording_id = cur.recording_id AND p.period < cur.period AND p.period >= cur.period - interval '3 months') AS average,
           (SELECT count(*)::int FROM m p WHERE p.recording_id = cur.recording_id AND p.period < cur.period AND p.period >= cur.period - interval '3 months') AS months,
           EXISTS (SELECT 1 FROM audit_flags f WHERE f.recording_id = cur.recording_id AND f.resolved_at IS NULL) AS flagged
    FROM m cur JOIN last ON last.period = cur.period JOIN recordings r ON r.id = cur.recording_id`;
  const duplicates = await tx<{ a: string; b: string }[]>`
    WITH st AS (SELECT s.id, s.ref, s.source, s.period, s.total_cents, (SELECT count(*) FROM income_lines l WHERE l.statement_id = s.id) AS n FROM income_statements s)
    SELECT x.ref AS a, y.ref AS b FROM st x JOIN st y ON x.source = y.source AND x.period = y.period AND x.total_cents = y.total_cents AND x.n = y.n AND x.n > 0 AND x.ref < y.ref
    ORDER BY 1, 2`;
  return {
    units: units.map((u) => ({ id: u.id, title: u.title, latest: Number(u.latest), average: Number(u.average ?? 0), months: u.months, flagged: u.flagged })),
    duplicates,
  };
}

async function metadataFacts(tx: Tx): Promise<MetadataFacts> {
  const recordings = await tx<{ id: string; title: string; on_release: boolean; isrc: string | null; genre: string | null; duration_s: number | null;
    has_owner: boolean; p_year: number | null; first_year: number | null; ai: boolean; contributors: number }[]>`
    SELECT r.slug AS id, r.title, EXISTS (SELECT 1 FROM release_tracks t WHERE t.recording_id = r.id) AS on_release, r.isrc, r.genre, r.duration_s,
           r.owner_id IS NOT NULL AS has_owner, r.p_year,
           (SELECT min(extract(year FROM rl.release_date))::int FROM release_tracks t JOIN releases rl ON rl.id = t.release_id WHERE t.recording_id = r.id AND rl.release_date <= current_date) AS first_year,
           r.ai_use <> 'undeclared' AS ai,
           (SELECT count(*)::int FROM recording_credits c WHERE c.recording_id = r.id AND c.party_id <> r.artist_id) AS contributors
    FROM recordings r ORDER BY r.created_at, r.slug`;
  const people = await tx<{ id: string; name: string; type: Person['type']; legal_name: string | null; pro: Person['pro']; ipi: string | null; email: string | null; phone: string | null;
    address: string | null; citizenship: string | null; domicile: string | null; on_catalog: boolean }[]>`
    SELECT p.slug AS id, p.name, p.type::text AS type, p.legal_name, p.pro::text AS pro, p.ipi, p.email, p.phone, p.address, p.citizenship, p.domicile,
           (EXISTS (SELECT 1 FROM recordings r JOIN release_tracks t ON t.recording_id = r.id WHERE r.artist_id = p.id OR r.owner_id = p.id)
            OR EXISTS (SELECT 1 FROM recording_credits c JOIN release_tracks t ON t.recording_id = c.recording_id WHERE c.party_id = p.id)
            OR EXISTS (SELECT 1 FROM work_writers ww WHERE ww.party_id = p.id OR ww.publisher_id = p.id)) AS on_catalog
    FROM parties p ORDER BY p.name`;
  return {
    recordings: recordings.map((r) => ({ id: r.id, title: r.title, onRelease: r.on_release, isrc: r.isrc, genre: r.genre, durationS: r.duration_s, hasOwner: r.has_owner,
      pYear: r.p_year, firstReleaseYear: r.first_year, aiDeclared: r.ai, contributors: r.contributors })),
    people: people.map((p) => ({ id: p.id, name: p.name, onCatalog: p.on_catalog,
      missing: personMissing({ id: p.id, name: p.name, type: p.type, legalName: p.legal_name, pro: p.pro, ipi: p.ipi, email: p.email, phone: p.phone, address: p.address, citizenship: p.citizenship, domicile: p.domicile }) })),
  };
}

async function rightsFacts(tx: Tx): Promise<RightsFacts> {
  const regs = await tx<{ org: RegOrg; work: string | null; rec: string | null; status: RegStatus; approval_id: string | null; decision: 'approved' | 'rejected' | null }[]>`
    SELECT g.org::text AS org, w.slug AS work, r.slug AS rec, g.status::text AS status, g.approval_id, d.status::text AS decision
    FROM registrations g LEFT JOIN works w ON w.id = g.work_id LEFT JOIN recordings r ON r.id = g.recording_id
    LEFT JOIN approval_decisions d ON d.tenant_id = g.tenant_id AND d.approval_id = g.approval_id`;
  const next = (org: RegOrg, work: string | null, rec: string | null): RegNext => {
    const g = regs.find((x) => x.org === org && (work ? x.work === work : x.rec === rec));
    return regState(g ? { status: g.status, approvalId: g.approval_id, decision: g.decision } : null).next;
  };
  // Released: on a release whose date has come, or comes within the next 60 days (file before it goes out).
  const songs = await tx<{ id: string; title: string; released: boolean }[]>`
    SELECT w.slug AS id, w.title, EXISTS (SELECT 1 FROM recordings r JOIN release_tracks t ON t.recording_id = r.id JOIN releases rl ON rl.id = t.release_id
      WHERE r.work_id = w.id AND rl.release_date <= current_date + 60) AS released FROM works w ORDER BY w.created_at, w.slug`;
  const recordings = await tx<{ id: string; title: string; released: boolean; isrc: boolean }[]>`
    SELECT r.slug AS id, r.title, r.isrc IS NOT NULL AS isrc, EXISTS (SELECT 1 FROM release_tracks t JOIN releases rl ON rl.id = t.release_id
      WHERE t.recording_id = r.id AND rl.release_date <= current_date + 60) AS released FROM recordings r ORDER BY r.created_at, r.slug`;
  const waiting = await tx<{ approval_id: string; title: string; days: number }[]>`
    SELECT g.approval_id, a.title, (current_date - d.decided_at::date)::int AS days
    FROM registrations g JOIN approvals a ON a.tenant_id = g.tenant_id AND a.id = g.approval_id
    JOIN approval_decisions d ON d.tenant_id = g.tenant_id AND d.approval_id = g.approval_id AND d.status = 'approved'
    WHERE g.status NOT IN ('submitted', 'confirmed')`;
  const unclaimed = await tx<{ id: string; what: string; source: string; amount_cents: string }[]>`
    SELECT slug AS id, what, CASE source WHEN 'soundexchange' THEN 'SoundExchange' WHEN 'mlc' THEN 'The MLC' ELSE 'A PRO' END AS source, amount_cents
    FROM unclaimed_royalties WHERE status = 'found' AND approval_id IS NULL`;
  return {
    songs: songs.map((s) => ({ ...s, pro: next('pro', s.id, null), mlc: next('mlc', s.id, null) })),
    recordings: recordings.map((r) => ({ ...r, sxOwner: next('sx_owner', null, r.id), sxArtist: next('sx_artist', null, r.id) })),
    approvedWaiting: waiting.map((w) => ({ approvalId: w.approval_id, title: w.title, days: w.days })),
    unclaimed: unclaimed.map((u) => ({ id: u.id, what: u.what, source: u.source, amountCents: Number(u.amount_cents) })),
  };
}

const eventId = () => `RUN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

/** One run for one workspace. `ctx` is who it acts for: the person who pressed Run now, or the workspace's owner on the schedule. */
export async function runAgents(ctx: RequestContext, trigger: 'schedule' | 'manual'): Promise<RunResult> {
  const result: RunResult = { found: 0, closed: 0, proposed: 0, fixed: 0, errors: [] };
  const { runId, depts, stored, found } = await withTenant(sql, ctx, async (tx) => {
    const [run] = await tx<{ id: string }[]>`INSERT INTO agent_runs (tenant_id, trigger, started_by) VALUES (${ctx.tenantId}, ${trigger}, ${trigger === 'manual' ? ctx.userId : null}) RETURNING id`;
    const depts = (await tx<{ slug: string; agent: string | null; autonomy: Dept['autonomy']; can_act: boolean }[]>`
      SELECT slug, agent, autonomy::text AS autonomy, can_act FROM departments WHERE slug = ANY(${[...ACTIVE]})`)
      .map((d) => ({ slug: d.slug, agent: d.agent ?? d.slug, autonomy: d.autonomy, canAct: d.can_act }));
    const stored = await tx<StoredFinding[]>`SELECT key, status::text AS status, approval_id AS "approvalId", fixed FROM agent_findings WHERE dept = ANY(${[...ACTIVE]})`;
    const found: Finding[] = [...metadataFindings(await metadataFacts(tx)), ...rightsFindings(await rightsFacts(tx)), ...royaltiesFindings(await royaltiesFacts(tx)), ...auditFindings(await auditFacts(tx))];
    return { runId: run.id, depts, stored, found };
  });
  const plan = planRun(found, stored, depts);

  // Cards: each through the same code a person's Prepare uses, marked as the agent's.
  const carded = new Map<string, string>();
  for (const f of plan.cards) {
    if (f.card?.kind !== 'registration') continue;
    const { org, subject, id } = f.card.args as { org: RegOrg; subject: 'work' | 'recording'; id: string };
    try {
      const out = await liveRegistrationAction(ctx, { action: 'prepare', org, subject, id }, { agent: true });
      if (!out.ok) { result.errors.push(`${f.title}: ${out.message}`); continue; }
      const cell = out.value.rows.flatMap((r) => r.cells).find((c) => c.approvalId?.startsWith(`reg_${org}_${id}`));
      carded.set(f.key, cell?.approvalId ?? `reg_${org}_${id}`);
    } catch (e) { result.errors.push(`${f.title}: ${(e as Error).message}`); }
  }

  await withTenant(sql, ctx, async (tx) => {
    // Fixes: only small, reversible ones, only with Act within limits.
    const fixedKeys = new Set<string>();
    for (const f of plan.fixes) {
      if (f.fix?.kind === 'set_p_year') {
        const res = await tx`UPDATE recordings SET p_year = ${Number(f.fix.args.year)}, updated_at = now() WHERE slug = ${String(f.fix.args.recording)} AND p_year IS NULL`;
        if (res.count) fixedKeys.add(f.key);
      } else if (f.fix?.kind === 'match_isrc') {
        // Lines whose reported ISRC is a recording's: matched as a person's Resolve would, by the agent.
        const res = await tx`UPDATE income_lines l SET recording_id = r.id, matched_at = now()
          FROM recordings r WHERE r.slug = ${String(f.fix.args.recording)} AND r.isrc = ${String(f.fix.args.isrc)}
            AND l.recording_id IS NULL AND l.work_id IS NULL AND upper(regexp_replace(coalesce(l.isrc, ''), '[^A-Za-z0-9]', '', 'g')) = r.isrc`;
        if (res.count) fixedKeys.add(f.key);
      }
    }
    const byKey = new Map(found.map((f) => [f.key, f]));
    for (const f of plan.open) {
      await tx`INSERT INTO agent_findings (tenant_id, key, dept, rule, title, detail, href, approval_id, fixed)
        VALUES (${ctx.tenantId}, ${f.key}, ${f.dept}, ${f.rule}, ${f.title}, ${f.detail}, ${f.href}, ${carded.get(f.key) ?? null}, ${fixedKeys.has(f.key)})
        ON CONFLICT (tenant_id, key) DO UPDATE SET status = 'open', closed_at = NULL, last_seen = now(), title = EXCLUDED.title, detail = EXCLUDED.detail, href = EXCLUDED.href,
          approval_id = coalesce(EXCLUDED.approval_id, agent_findings.approval_id), fixed = EXCLUDED.fixed`;
    }
    for (const key of plan.keep) {
      const f = byKey.get(key)!;
      await tx`UPDATE agent_findings SET last_seen = now(), title = ${f.title}, detail = ${f.detail},
        approval_id = coalesce(${carded.get(key) ?? null}, approval_id), fixed = fixed OR ${fixedKeys.has(key)} WHERE key = ${key}`;
    }
    // A fix closes its finding at once: it's done.
    const closing = [...plan.close, ...fixedKeys];
    if (closing.length) await tx`UPDATE agent_findings SET status = 'resolved', closed_at = now() WHERE key = ANY(${closing}) AND status = 'open'`;

    for (const d of depts) {
      const mine = (keys: Iterable<string>) => [...keys].filter((k) => k.startsWith(`${d.slug}:`));
      const opened = plan.open.filter((f) => f.dept === d.slug);
      const summary = runSummary(d.agent, { opened: opened.length, closed: mine(plan.close).length, cards: mine(carded.keys()).length, fixes: mine(fixedKeys).length });
      if (summary) {
        const cards = mine(carded.keys()).map((k) => carded.get(k)!);
        await tx`INSERT INTO agent_events (tenant_id, id, occurred_at, kind, text, who, dept, inputs, reasoning, output)
          VALUES (${ctx.tenantId}, ${eventId()}, now(), 'Agent run', ${summary}, ${d.agent}, ${DEPT_NAME[d.slug] ?? d.slug},
            ARRAY(SELECT jsonb_array_elements_text(${tx.json([trigger === 'manual' ? 'Run now' : 'Daily run', ...(INPUTS[d.slug] ?? [])] as never)}::jsonb)),
            ${opened.slice(0, 10).map((f) => f.title).join('. ')}, ${cards.length ? `In Approvals: ${cards.join(', ')}` : ''})`;
      }
      const [{ open, waiting }] = await tx<{ open: number; waiting: number }[]>`
        SELECT count(*) FILTER (WHERE f.status = 'open')::int AS open,
               count(*) FILTER (WHERE f.status = 'open' AND f.approval_id IS NOT NULL AND d.approval_id IS NULL)::int AS waiting
        FROM agent_findings f LEFT JOIN approval_decisions d ON d.tenant_id = f.tenant_id AND d.approval_id = f.approval_id WHERE f.dept = ${d.slug}`;
      const [{ week }] = await tx<{ week: number }[]>`SELECT count(*)::int AS week FROM agent_findings WHERE dept = ${d.slug} AND (first_seen > now() - interval '7 days' OR closed_at > now() - interval '7 days')`;
      if (d.autonomy) await tx`UPDATE departments SET state = ${deptState(open, waiting)}, tasks_this_week = ${week} WHERE slug = ${d.slug}`;
    }
    result.found = plan.open.length;
    result.closed = closing.length;
    result.proposed = carded.size;
    result.fixed = fixedKeys.size;
    await tx`UPDATE agent_runs SET finished_at = now(), found = ${result.found}, closed = ${result.closed}, proposed = ${result.proposed}, fixed = ${result.fixed},
      error = ${result.errors.length ? result.errors.join('\n').slice(0, 2000) : null} WHERE id = ${runId}`;
  });
  return result;
}

/** The scheduled run: every workspace, each as its owner. One workspace's failure doesn't stop the rest. */
export async function runAllAgents(): Promise<{ workspaces: number; failed: number }> {
  const targets = await sql<{ tenant_id: string; user_id: string; name: string; kind: RequestContext['tenantKind'] }[]>`SELECT tenant_id, user_id, name, kind FROM app_agent_tenants()`;
  let failed = 0;
  for (const t of targets) {
    const ctx = { userId: t.user_id, email: '', tenantId: t.tenant_id, tenantName: t.name, tenantKind: t.kind, role: 'owner', tenants: [], workspaces: [], connections: [] } as RequestContext;
    try { await runAgents(ctx, 'schedule'); } catch { failed++; }
  }
  return { workspaces: targets.length, failed };
}

const AGENT: Record<string, string> = { metadata: 'Metadata Agent', rights: 'Rights Agent', royalties: 'Royalties Agent', audit: 'Audit Agent' };
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const when = (d: Date) => `${day(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`;

async function agentsIn(tx: Tx): Promise<AgentsView> {
  const [run] = await tx<{ started_at: Date; trigger: 'schedule' | 'manual'; found: number; closed: number; proposed: number; fixed: number; error: string | null }[]>`
    SELECT started_at, trigger::text AS trigger, found, closed, proposed, fixed, error FROM agent_runs WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1`;
  const rows = await tx<{ key: string; dept: string; agent: string | null; rule: string; title: string; detail: string; href: string | null; approval_id: string | null; first_seen: Date }[]>`
    SELECT f.key, f.dept, d.agent, f.rule, f.title, f.detail, f.href, f.approval_id, f.first_seen
    FROM agent_findings f JOIN departments d ON d.tenant_id = f.tenant_id AND d.slug = f.dept
    WHERE f.status = 'open' ORDER BY f.approval_id IS NULL, f.first_seen, f.key`;
  return {
    live: true,
    lastRun: run ? { at: when(run.started_at), trigger: run.trigger, found: run.found, closed: run.closed, proposed: run.proposed, fixed: run.fixed, error: run.error } : null,
    findings: rows.map((f) => ({ key: f.key, dept: f.dept, agent: f.agent ?? AGENT[f.dept] ?? f.dept, rule: f.rule, title: f.title, detail: f.detail, href: f.href, approvalId: f.approval_id, since: day(f.first_seen) })),
  };
}

export type AgentsView = z.infer<typeof AgentsResponse>;

/** What the agents found that's still open, and their last run. */
export function liveAgents(ctx: RequestContext): Promise<AgentsView> {
  return withTenant(sql, ctx, agentsIn);
}

/** A person says a finding isn't worth acting on; the agents won't raise it again. */
export function liveDismissFinding(ctx: RequestContext, key: string, note: string): Promise<AgentsView | null> {
  return withTenant(sql, ctx, async (tx) => {
    const res = await tx`UPDATE agent_findings SET status = 'dismissed', closed_at = now(), dismiss_note = ${note} WHERE key = ${key} AND status = 'open'`;
    if (!res.count) return null;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-AGT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'finding.dismissed', ${key}, ${tx.json({ note })})`;
    return agentsIn(tx);
  });
}
