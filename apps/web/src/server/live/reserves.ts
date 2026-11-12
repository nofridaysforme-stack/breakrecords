import 'server-only';
import type { Proposal, ReservesResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { dayMonth } from '@breakrecords/core/payouts';
import { heldShare, isHeld, reserveStatus, type ReserveOutcome } from '@breakrecords/core/reserves';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveApprovals } from './approvals';

export type ReserveOutcome2<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'already_flagged' | 'already_decided'; message: string };

/** Held income by release and month: the flagged recordings' share of each release's income. */
export type Holds = Map<string, { recordings: string[]; flagged: number; total: number }>;
const key = (releaseId: string, period: string) => `${releaseId}|${period}`;
export async function holdsIn(tx: Tx): Promise<Holds> {
  const rows = await tx<{ release_id: string; period: string; recordings: string[]; flagged_cents: string; total_cents: string }[]>`
    SELECT release_id, to_char(period, 'YYYY-MM-DD') AS period, recordings, flagged_cents, total_cents FROM app_reserve_holds()`;
  return new Map(rows.map((r) => [key(r.release_id, r.period), { recordings: r.recordings, flagged: Number(r.flagged_cents), total: Number(r.total_cents) }]));
}
/** What one line or statement holds: its share of the flagged income for its release and month. */
export function heldFor(holds: Holds, releaseId: string | null, period: string, amount: number): { held: number; recordings: string[] } {
  const h = releaseId ? holds.get(key(releaseId, period)) : undefined;
  return h ? { held: heldShare(amount, h.flagged, h.total), recordings: h.recordings } : { held: 0, recordings: [] };
}

/** Held from each unpaid batch line, by line id. */
export async function heldLines(tx: Tx): Promise<{ lineId: string; batchId: string; recordings: string[]; held: number }[]> {
  const holds = await holdsIn(tx);
  if (!holds.size) return [];
  const lines = await tx<{ id: string; batch_id: string; source_release_id: string | null; period: string; amount_cents: string }[]>`
    SELECT l.id, l.batch_id, l.source_release_id, to_char(b.period, 'YYYY-MM-DD') AS period, l.amount_cents
    FROM payout_lines l JOIN payout_batches b ON b.id = l.batch_id
    WHERE b.status IN ('draft', 'awaiting') AND l.status = 'included'`;
  return lines.map((l) => ({ lineId: l.id, batchId: l.batch_id, ...heldFor(holds, l.source_release_id, l.period, Number(l.amount_cents)) })).filter((l) => l.held > 0);
}

async function reservesIn(tx: Tx): Promise<ReservesResponse> {
  const rows = await tx<{ id: string; recording: string; recording_slug: string; recording_id: string; note: string; opened_at: Date; amount_cents: string;
    outcome: ReserveOutcome | null; outcome_note: string | null; release_approval_id: string | null; released_at: Date | null; decision: 'approved' | 'rejected' | null }[]>`
    SELECT r.id, rec.title AS recording, rec.slug AS recording_slug, r.recording_id, f.note, r.opened_at, r.amount_cents, r.outcome, r.outcome_note,
           r.release_approval_id, r.released_at, d.status::text AS decision
    FROM reserves r JOIN audit_flags f ON f.id = r.flag_id JOIN recordings rec ON rec.id = r.recording_id
    LEFT JOIN approval_decisions d ON d.approval_id = r.release_approval_id
    ORDER BY (r.outcome IS NULL) DESC, r.opened_at DESC`;
  const lines = await heldLines(tx);
  const recordings = await tx<{ slug: string; title: string }[]>`SELECT slug, title FROM recordings ORDER BY title`;
  return {
    items: rows.map((r) => {
      const status = reserveStatus({ outcome: r.outcome, releaseDecision: r.decision, releasedBefore: !!r.released_at });
      return {
        id: r.id, recording: r.recording, recordingId: r.recording_slug, note: r.note, opened: dayMonth(r.opened_at), amount: Number(r.amount_cents),
        heldNow: isHeld(status) ? lines.filter((l) => l.recordings.includes(r.recording)).reduce((a, l) => a + l.held, 0) : 0,
        status, ...(r.outcome_note ? { outcomeNote: r.outcome_note } : {}), ...(r.release_approval_id ? { approvalId: r.release_approval_id } : {}),
      };
    }),
    recordings: recordings.map((r) => ({ id: r.slug, title: r.title })),
  };
}

/** Audit flags and their reserves for the signed-in label. */
export function liveReserves(ctx: RequestContext): Promise<ReservesResponse> {
  return withTenant(sql, ctx, reservesIn);
}

const audit = (tx: Tx, ctx: RequestContext, kind: string, ref: string, data: object) =>
  tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (${ctx.tenantId}, ${'AUD-RSV-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;

/** Flags a recording: its income in periods not yet paid out is held until the flag is resolved. */
export function liveOpenFlag(ctx: RequestContext, recordingSlug: string, note: string): Promise<ReserveOutcome2<ReservesResponse>> {
  return withTenant(sql, ctx, async (tx) => {
    const [rec] = await tx<{ id: string; title: string }[]>`SELECT id, title FROM recordings WHERE slug = ${recordingSlug}`;
    if (!rec) return { ok: false, status: 404, error: 'not_found', message: 'No such recording.' } as const;
    const [open] = await tx`SELECT 1 FROM reserves r WHERE r.recording_id = ${rec.id} AND r.outcome IS NULL`;
    if (open) return { ok: false, status: 409, error: 'already_flagged', message: `${rec.title} is already flagged. Its income is held.` } as const;
    const [flag] = await tx<{ id: string }[]>`INSERT INTO audit_flags (tenant_id, recording_id, kind, note) VALUES (${ctx.tenantId}, ${rec.id}, 'other', ${note}) RETURNING id`;
    const [amount] = await tx<{ cents: string }[]>`
      SELECT coalesce(sum(l.amount_cents), 0) AS cents FROM income_lines l JOIN income_statements s ON s.id = l.statement_id
      WHERE l.recording_id = ${rec.id} AND NOT EXISTS (SELECT 1 FROM payout_batches b WHERE b.period = s.period AND b.status IN ('sent', 'failed'))`;
    await tx`INSERT INTO reserves (tenant_id, flag_id, recording_id, amount_cents) VALUES (${ctx.tenantId}, ${flag.id}, ${rec.id}, ${amount.cents})`;
    await audit(tx, ctx, 'audit_flag.opened', recordingSlug, { note, held: Number(amount.cents) });
    return { ok: true, value: await reservesIn(tx) } as const;
  });
}

/**
 * Resolves a flag. Artificial streams: the held income is forfeited. Real listeners: the flag
 * closes and an approval card asks to release the money; it stays held until that is approved.
 */
export async function liveResolveFlag(ctx: RequestContext, id: string, outcome: ReserveOutcome, note: string): Promise<ReserveOutcome2<ReservesResponse>> {
  const pre = await withTenant(sql, ctx, async (tx) => {
    const [r] = await tx<{ id: string; outcome: string | null; recording: string; amount: string }[]>`
      SELECT r.id, r.outcome, rec.title AS recording, r.amount_cents AS amount FROM reserves r JOIN recordings rec ON rec.id = r.recording_id
      WHERE r.id::text = ${id}`;
    return r ? { ...r, heldNow: (await heldLines(tx)).filter((l) => l.recordings.includes(r.recording)).reduce((a, l) => a + l.held, 0) } : null;
  });
  if (!pre) return { ok: false, status: 404, error: 'not_found', message: 'No such reserve.' };
  if (pre.outcome) return { ok: false, status: 409, error: 'already_decided', message: 'This flag was already resolved.' };
  const approvalId = outcome === 'release' ? `reserve_${pre.id.slice(0, 8)}` : null;
  if (approvalId) {
    const held = Math.max(pre.heldNow, 0);
    const proposal: Proposal = {
      id: approvalId, type: 'money', title: `Release ${formatMoney(held)} held on ${pre.recording}`, agent: 'Royalties Agent', due: 'Next payout',
      impact: `${formatMoney(held)} goes back into the next batch`, risk: 'needsEyes', riskLabel: 'Reserve release', context: 'Audit flag resolved',
      href: '/money/payouts#reserves', dept: 'Finance',
    };
    const out = await liveApprovals(ctx).propose(proposal);
    if (!out.ok) return { ok: false, status: 409, error: 'already_decided', message: out.message };
  }
  return withTenant(sql, ctx, async (tx) => {
    const done = await tx`UPDATE reserves SET outcome = ${outcome}, outcome_note = ${note}, decided_by = ${ctx.userId}, decided_at = clock_timestamp(), release_approval_id = ${approvalId}
      WHERE id::text = ${id} AND outcome IS NULL`;
    if (!done.count) return { ok: false, status: 409, error: 'already_decided', message: 'This flag was already resolved.' } as const;
    await tx`UPDATE audit_flags SET resolved_at = clock_timestamp(), resolved_by = ${ctx.userId}, resolution = ${note}
      WHERE id = (SELECT flag_id FROM reserves WHERE id::text = ${id}) AND resolved_at IS NULL`;
    await audit(tx, ctx, 'audit_flag.resolved', pre.recording, { outcome, note, approvalId });
    return { ok: true, value: await reservesIn(tx) } as const;
  });
}

/** Home's "Needs you": flags still waiting on a decision, and what each holds. */
export function liveHomeReserves(ctx: RequestContext) {
  return withTenant(sql, ctx, async (tx) => (await reservesIn(tx)).items.filter((r) => r.status === 'held').map((r) => ({ id: r.id, recording: r.recording, note: r.note, held: r.heldNow })));
}
