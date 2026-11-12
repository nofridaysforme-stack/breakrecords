import 'server-only';
import type { Proposal, SyncResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { dayMonthYear } from '@breakrecords/core/payouts';
import { licenseSections, MEDIA, oneStop, quoteState, splitFee, type SyncMedia } from '@breakrecords/core/sync';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveApprovals } from './approvals';
import { freeSlug } from './catalog';

export type SyncOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'not_allowed' | 'already_quoted' | 'forbidden'; message: string };
const audit = (tx: Tx, ctx: RequestContext, kind: string, ref: string, data: object) =>
  tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (${ctx.tenantId}, ${'AUD-SYN-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;

/** Each recording, and whether the label can clear both master and song (one-stop). */
async function recordingsIn(tx: Tx): Promise<SyncResponse['recordings']> {
  const [settings] = await tx<{ mode: string | null }[]>`SELECT publishing_mode AS mode FROM label_settings`;
  const controlled = ['self', 'we_publish', 'we_administer'].includes(settings?.mode ?? '');
  const rows = await tx<{ slug: string; title: string; artist: string; has_song: boolean; confirmed: boolean }[]>`
    SELECT r.slug, r.title, a.name AS artist, r.work_id IS NOT NULL AS has_song,
           coalesce((SELECT sum(share_bp) = 10000 AND bool_and(confirmed) FROM work_writers ww WHERE ww.work_id = r.work_id), false) AS confirmed
    FROM recordings r JOIN parties a ON a.id = r.artist_id ORDER BY r.title`;
  return rows.map((r) => {
    const o = oneStop({ hasSong: r.has_song, writersConfirmed: r.confirmed, publishingControlled: controlled });
    return { id: r.slug, title: r.title, artist: r.artist, oneStop: o.ok, oneStopNote: o.note };
  });
}

async function syncIn(tx: Tx): Promise<SyncResponse> {
  const briefs = await tx<{ id: string; slug: string; title: string; client: string; media: SyncMedia; territory: string; term: string; budget_cents: string | null; due_on: Date | null; notes: string | null; closed_at: Date | null }[]>`
    SELECT id, slug, title, client, media::text AS media, territory, term, budget_cents, due_on, notes, closed_at FROM sync_briefs ORDER BY (closed_at IS NULL) DESC, created_at DESC`;
  const quotes = await tx<{ id: string; brief_id: string; rec: string; title: string; artist: string; fee_cents: string; master_bp: number; use_desc: string; status: 'draft' | 'sent' | 'accepted' | 'declined';
    approval_id: string | null; decision: 'approved' | 'rejected' | null; paid_ref: string | null }[]>`
    SELECT q.id, q.brief_id, r.slug AS rec, r.title, a.name AS artist, q.fee_cents, q.master_bp, q.use_desc, q.status, q.approval_id,
           (SELECT d.status::text FROM approval_decisions d WHERE d.approval_id = q.approval_id) AS decision,
           (SELECT s.ref FROM income_statements s WHERE s.id = q.statement_id) AS paid_ref
    FROM sync_quotes q JOIN recordings r ON r.id = q.recording_id JOIN parties a ON a.id = r.artist_id ORDER BY q.created_at`;
  return {
    briefs: briefs.map((b) => ({
      id: b.slug, title: b.title, client: b.client, media: b.media, territory: b.territory, term: b.term,
      budget: b.budget_cents == null ? null : Number(b.budget_cents), due: b.due_on ? dayMonthYear(b.due_on) : null, notes: b.notes, closed: !!b.closed_at,
      quotes: quotes.filter((q) => q.brief_id === b.id).map((q) => {
        const fee = Number(q.fee_cents);
        return {
          id: q.id, recordingId: q.rec, recording: q.title, artist: q.artist, fee, masterBp: q.master_bp, ...splitFee(fee, q.master_bp), use: q.use_desc,
          state: quoteState({ status: q.status, decision: q.decision, paid: !!q.paid_ref }),
          ...(q.approval_id ? { approvalId: q.approval_id } : {}), ...(q.paid_ref ? { paidRef: q.paid_ref } : {}),
        };
      }),
    })),
    recordings: await recordingsIn(tx),
  };
}

export function liveSync(ctx: RequestContext): Promise<SyncResponse> {
  return withTenant(sql, ctx, syncIn);
}

export function liveCreateBrief(ctx: RequestContext, c: { title: string; client: string; media: SyncMedia; territory?: string; term?: string; budget?: number; due?: string; notes?: string }): Promise<SyncOutcome<SyncResponse>> {
  return withTenant(sql, ctx, async (tx) => {
    const slug = await freeSlug(tx, 'sync_briefs', c.title);
    await tx`INSERT INTO sync_briefs (tenant_id, slug, title, client, media, territory, term, budget_cents, due_on, notes, created_by)
      VALUES (${ctx.tenantId}, ${slug}, ${c.title}, ${c.client}, ${c.media}, ${c.territory ?? 'Worldwide'}, ${c.term ?? 'In perpetuity'}, ${c.budget ?? null}, ${c.due ?? null}, ${c.notes || null}, ${ctx.userId})`;
    await audit(tx, ctx, 'sync_brief.created', slug, { client: c.client, media: c.media });
    return { ok: true, value: await syncIn(tx) } as const;
  });
}

export function liveCreateQuote(ctx: RequestContext, briefSlug: string, c: { recordingId: string; fee: number; masterBp?: number; use: string }): Promise<SyncOutcome<SyncResponse>> {
  return withTenant(sql, ctx, async (tx) => {
    const [b] = await tx<{ id: string; closed: boolean }[]>`SELECT id, closed_at IS NOT NULL AS closed FROM sync_briefs WHERE slug = ${briefSlug}`;
    const [r] = await tx<{ id: string }[]>`SELECT id FROM recordings WHERE slug = ${c.recordingId}`;
    if (!b || !r) return { ok: false, status: 404, error: 'not_found', message: !b ? 'No such brief.' : 'No such recording.' } as const;
    if (b.closed) return { ok: false, status: 409, error: 'not_allowed', message: 'This brief is closed.' } as const;
    const made = await tx`INSERT INTO sync_quotes (tenant_id, brief_id, recording_id, fee_cents, master_bp, use_desc, created_by)
      VALUES (${ctx.tenantId}, ${b.id}, ${r.id}, ${c.fee}, ${c.masterBp ?? 5000}, ${c.use}, ${ctx.userId}) ON CONFLICT (brief_id, recording_id) DO NOTHING`;
    if (!made.count) return { ok: false, status: 409, error: 'already_quoted', message: 'That recording is already quoted for this brief.' } as const;
    await audit(tx, ctx, 'sync_quote.created', briefSlug, { recording: c.recordingId, fee: c.fee });
    return { ok: true, value: await syncIn(tx) } as const;
  });
}

/**
 * Moves a quote on: sent (recorded; the label sends it), accepted (a signature card for the
 * license), declined, or paid (the fee recorded as sync income, once the license is signed).
 */
export async function liveQuoteAction(ctx: RequestContext, id: string, action: 'send' | 'accept' | 'decline' | 'paid'): Promise<SyncOutcome<SyncResponse>> {
  const q = await withTenant(sql, ctx, async (tx) => {
    const [row] = await tx<{ id: string; status: string; approval_id: string | null; statement_id: string | null; fee: string; master_bp: number; rec_id: string; work_id: string | null; title: string; artist: string; client: string; brief: string; decision: string | null }[]>`
      SELECT q.id, q.status, q.approval_id, q.statement_id, q.fee_cents AS fee, q.master_bp, r.id AS rec_id, r.work_id, r.title, a.name AS artist, b.client, b.slug AS brief,
             (SELECT d.status::text FROM approval_decisions d WHERE d.approval_id = q.approval_id) AS decision
      FROM sync_quotes q JOIN recordings r ON r.id = q.recording_id JOIN parties a ON a.id = r.artist_id JOIN sync_briefs b ON b.id = q.brief_id WHERE q.id::text = ${id}`;
    return row ?? null;
  });
  if (!q) return { ok: false, status: 404, error: 'not_found', message: 'No such quote.' };
  const refuse = (message: string) => ({ ok: false as const, status: 409, error: 'not_allowed' as const, message });
  if (action === 'send' && q.status !== 'draft') return refuse('Only a draft quote can be sent.');
  if ((action === 'accept' || action === 'decline') && q.status !== 'sent') return refuse('Mark the quote sent first. Only a sent quote is accepted or declined.');
  if (action === 'paid' && (q.status !== 'accepted' || q.decision !== 'approved')) return refuse('The license has to be signed (its approval card approved) before the fee is recorded.');
  if (action === 'paid' && q.statement_id) return refuse('This fee is already recorded.');

  let approvalId: string | null = null;
  if (action === 'accept') {
    approvalId = `sync_${q.id.slice(0, 8)}`;
    const proposal: Proposal = {
      id: approvalId, type: 'signature', title: `Sign sync license: ${q.title} for ${q.client}`, agent: 'Legal Agent', due: 'This week',
      impact: `${formatMoney(Number(q.fee))} license fee`, risk: 'needsEyes', riskLabel: 'Signature', context: 'Sync license', href: `/sync#${q.brief}`, dept: 'Legal',
    };
    const out = await liveApprovals(ctx).propose(proposal);
    if (!out.ok) return refuse(out.message);
  }
  return withTenant(sql, ctx, async (tx) => {
    if (action === 'send') await tx`UPDATE sync_quotes SET status = 'sent', sent_at = clock_timestamp() WHERE id = ${q.id}`;
    if (action === 'decline') await tx`UPDATE sync_quotes SET status = 'declined', decided_at = clock_timestamp() WHERE id = ${q.id}`;
    if (action === 'accept') await tx`UPDATE sync_quotes SET status = 'accepted', decided_at = clock_timestamp(), approval_id = ${approvalId} WHERE id = ${q.id}`;
    if (action === 'paid') {
      // The fee as sync income: the master's part on the recording, the song's part on its song.
      const fee = Number(q.fee);
      const { master, song } = splitFee(fee, q.master_bp);
      const today = new Date().toISOString().slice(0, 10);
      const ref = `SYNC-${today.slice(2, 4)}${today.slice(5, 7)}-${q.id.slice(0, 6).toUpperCase()}`;
      const [st] = await tx<{ id: string }[]>`INSERT INTO income_statements (tenant_id, ref, source, period, received_on, total_cents, provider)
        VALUES (${ctx.tenantId}, ${ref}, 'sync', ${today.slice(0, 8) + '01'}, ${today}, ${fee}, ${q.client}) RETURNING id`;
      let n = 0;
      if (master) await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, store, units, amount_cents, recording_id)
        VALUES (${ctx.tenantId}, ${st.id}, ${++n}, ${q.title}, ${'Sync: ' + q.client}, 1, ${master}, ${q.rec_id})`;
      if (song) await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, store, units, amount_cents, work_id)
        VALUES (${ctx.tenantId}, ${st.id}, ${++n}, ${q.title + ' (song)'}, ${'Sync: ' + q.client}, 1, ${song}, ${q.work_id})`;
      await tx`UPDATE sync_quotes SET statement_id = ${st.id} WHERE id = ${q.id}`;
    }
    await audit(tx, ctx, `sync_quote.${action}`, q.brief, { recording: q.title, approvalId });
    return { ok: true, value: await syncIn(tx) } as const;
  });
}

/** The license for a quote, built from the sync template; `signed` once its approval card is approved. */
export function liveLicense(ctx: RequestContext, id: string) {
  return withTenant(sql, ctx, async (tx) => {
    const [q] = await tx<{ title: string; artist: string; isrc: string | null; song: string | null; client: string; media: SyncMedia; use_desc: string; territory: string; term: string; fee: string; master_bp: number;
      status: string; decision: string | null; decided_at: Date | null }[]>`
      SELECT r.title, a.name AS artist, r.isrc, w.title AS song, b.client, b.media::text AS media, q.use_desc, b.territory, b.term, q.fee_cents AS fee, q.master_bp, q.status,
             (SELECT d.status::text FROM approval_decisions d WHERE d.approval_id = q.approval_id) AS decision, q.decided_at
      FROM sync_quotes q JOIN recordings r ON r.id = q.recording_id JOIN parties a ON a.id = r.artist_id LEFT JOIN works w ON w.id = r.work_id JOIN sync_briefs b ON b.id = q.brief_id
      WHERE q.id::text = ${id}`;
    if (!q) return null;
    const [t] = await tx<{ clauses: { title: string; text: string }[] }[]>`SELECT clauses FROM contract_templates WHERE slug = 'sync'`;
    const signed = q.status === 'accepted' && q.decision === 'approved';
    return {
      signed, title: `Sync license: ${q.title} for ${q.client}`, media: MEDIA[q.media],
      sections: licenseSections({ licensor: ctx.tenantName, client: q.client, recording: q.title, artist: q.artist, isrc: q.isrc, song: q.song, media: q.media, use: q.use_desc,
        territory: q.territory, term: q.term, fee: Number(q.fee), masterBp: q.master_bp, clauses: t?.clauses ?? [], date: dayMonthYear(q.decided_at ?? new Date()) }),
    };
  });
}
