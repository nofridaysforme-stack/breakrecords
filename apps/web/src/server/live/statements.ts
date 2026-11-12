import 'server-only';
import { heldNote } from '@breakrecords/core/reserves';
import { heldFor, holdsIn } from './reserves';
import { changeNote, checkStatement, periodLabel, suggestIsrcMatch, unmatchedNote } from '@breakrecords/core/statements';
import type { WaterfallRow } from '@breakrecords/core/waterfall';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { royalties as sample, type Statement } from '@/data/money';
import type { StatementSummary } from '@/data/api';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Royalties = typeof sample;

const SOURCE: Record<string, string> = { distributor: 'Distributor', soundexchange: 'SoundExchange', mlc: 'MLC', pro: 'PRO', sync: 'Sync', bandcamp: 'Bandcamp' };
const n = (v: unknown) => Number(v ?? 0);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function royaltiesIn(tx: Tx): Promise<Royalties> {
  const [{ cur, prev }] = await tx<{ cur: Date | null; prev: Date | null }[]>`
    SELECT max(period) AS cur, (SELECT max(period) FROM income_statements WHERE period < (SELECT max(period) FROM income_statements)) AS prev
    FROM income_statements`;
  const unclaimedRows = await tx<{ cents: string; sources: number }[]>`
    SELECT coalesce(sum(amount_cents), 0) AS cents, count(DISTINCT source)::int AS sources
    FROM unclaimed_royalties WHERE status IN ('found', 'claim_prepared', 'claimed')`;
  const unclaimed = n(unclaimedRows[0].cents);
  const unclaimedNote = unclaimedRows[0].sources ? `${unclaimedRows[0].sources} source${unclaimedRows[0].sources === 1 ? '' : 's'} to claim` : 'Nothing found to claim';
  if (!cur) {
    return {
      period: 'No statements yet', stats: { income: 0, incomeNote: 'First period on record', paid: 0, paidNote: 'No statements yet', matched: 0, lines: 0, unclaimed, unclaimedNote },
      sources: [], byArtist: [], unmatched: { count: 0, value: 0, note: unmatchedNote([], 0), suggestions: [], unknown: { count: 0, value: 0 } },
      zeroTracks: [], policyVerified: sample.policyVerified,
    };
  }
  const period = iso(cur);

  const [totals] = await tx<{ income: string; lines: number; matched: number; prev_income: string | null }[]>`
    SELECT coalesce(sum(l.amount_cents), 0) AS income, count(*)::int AS lines,
           count(*) FILTER (WHERE l.recording_id IS NOT NULL OR l.work_id IS NOT NULL)::int AS matched,
           (SELECT sum(l2.amount_cents) FROM income_lines l2 JOIN income_statements s2 ON s2.id = l2.statement_id WHERE s2.period = ${prev ? iso(prev) : null}) AS prev_income
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id WHERE s.period = ${period}`;

  const sources = await tx<{ source: string; cents: string }[]>`
    SELECT s.source::text AS source, sum(l.amount_cents) AS cents
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id WHERE s.period = ${period}
    GROUP BY s.source ORDER BY sum(l.amount_cents) DESC, s.source`;

  const byArtist = await tx<{ name: string; cents: string; titles: string[] }[]>`
    WITH m AS (
      -- A line's artist: the recording's, or for song income, the artist of the song's first recording.
      SELECT coalesce(r.artist_id, (SELECT r2.artist_id FROM recordings r2 WHERE r2.work_id = l.work_id ORDER BY r2.created_at LIMIT 1)) AS artist_id, coalesce(r.title, w.title) AS title, l.amount_cents
      FROM income_lines l JOIN income_statements s ON s.id = l.statement_id
      LEFT JOIN recordings r ON r.id = l.recording_id LEFT JOIN works w ON w.id = l.work_id
      WHERE s.period = ${period} AND (l.recording_id IS NOT NULL OR l.work_id IS NOT NULL)
    ), t AS (SELECT artist_id, title, sum(amount_cents) AS cents FROM m GROUP BY artist_id, title)
    SELECT p.name, sum(t.cents) AS cents, array_agg(t.title ORDER BY t.cents DESC, t.title) FILTER (WHERE t.cents > 0) AS titles
    FROM t JOIN parties p ON p.id = t.artist_id GROUP BY p.name ORDER BY sum(t.cents) DESC, p.name`;

  const unmatched = await tx<{ isrc: string | null; source: string; count: number; cents: string }[]>`
    SELECT upper(btrim(l.isrc)) AS isrc, min(s.source::text) AS source, count(*)::int AS count, sum(l.amount_cents) AS cents
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id
    WHERE s.period = ${period} AND l.recording_id IS NULL AND l.work_id IS NULL
    GROUP BY upper(btrim(l.isrc)) ORDER BY count(*) DESC`;
  const catalog = await tx<{ id: string; title: string; isrc: string | null }[]>`SELECT slug AS id, title, isrc FROM recordings`;
  const suggestions: Royalties['unmatched']['suggestions'] = [];
  const unknown = { count: 0, value: 0 };
  for (const u of unmatched) {
    const s = u.isrc ? suggestIsrcMatch(u.isrc, catalog) : null;
    if (s && u.isrc) suggestions.push({ isrc: u.isrc, source: SOURCE[u.source], count: u.count, value: n(u.cents), ...s });
    else { unknown.count += u.count; unknown.value += n(u.cents); }
  }

  const zero = await tx<{ title: string; units: string }[]>`
    SELECT r.title, sum(l.units) AS units
    FROM income_lines l JOIN income_statements s ON s.id = l.statement_id JOIN recordings r ON r.id = l.recording_id
    WHERE s.period = ${period} GROUP BY r.id, r.title HAVING sum(l.amount_cents) = 0 AND sum(l.units) > 0 ORDER BY sum(l.units), r.title`;

  const [paid] = await tx<{ cents: string; count: number }[]>`
    SELECT coalesce(sum(net_cents), 0) AS cents, count(*)::int AS count FROM payee_statements WHERE period = ${period}`;

  const income = n(totals.income);
  const unmatchedCount = totals.lines - totals.matched;
  return {
    period: periodLabel(cur),
    stats: {
      income, incomeNote: changeNote(income, totals.prev_income === null ? null : n(totals.prev_income), prev),
      paid: n(paid.cents), paidNote: paid.count ? `${paid.count} statement${paid.count === 1 ? '' : 's'} this period` : 'No statements yet',
      matched: totals.matched, lines: totals.lines, unclaimed, unclaimedNote,
    },
    sources: sources.map((x) => ({ name: SOURCE[x.source], amount: n(x.cents) })),
    byArtist: byArtist.map((x) => ({ name: x.name, meta: list(x.titles ?? []) || 'Matched lines', amount: n(x.cents) })),
    unmatched: {
      count: unmatchedCount, value: suggestions.reduce((a, x) => a + x.value, 0) + unknown.value,
      note: unmatchedNote(suggestions, unknown.count), suggestions, unknown,
    },
    zeroTracks: zero.map((z) => ({ name: z.title, streams: n(z.units) })),
    policyVerified: sample.policyVerified,
  };
}

/** Royalties (4b) for the signed-in tenant's latest period, computed from its income lines. */
export function liveRoyalties(ctx: RequestContext): Promise<Royalties> {
  return withTenant(sql, ctx, royaltiesIn);
}

export type LiveMatch = { ok: true; royalties: Royalties } | { ok: false; status: number; error: 'not_found' | 'nothing_to_match'; message: string };

/** Points every unmatched line that carries `isrc` at a recording. Money never changes; the match is audited. */
export function liveMatchLines(ctx: RequestContext, isrc: string, recordingId: string): Promise<LiveMatch> {
  const code = isrc.trim().toUpperCase();
  return withTenant(sql, ctx, async (tx) => {
    const [rec] = await tx<{ id: string; title: string }[]>`SELECT id, title FROM recordings WHERE slug = ${recordingId}`;
    if (!rec) return { ok: false, status: 404, error: 'not_found', message: 'No such recording in your catalog.' } as const;
    const done = await tx<{ amount_cents: string }[]>`
      UPDATE income_lines SET recording_id = ${rec.id}, matched_by = ${ctx.userId}, matched_at = now()
      WHERE recording_id IS NULL AND work_id IS NULL AND upper(btrim(isrc)) = ${code}
      RETURNING amount_cents`;
    if (!done.length) return { ok: false, status: 409, error: 'nothing_to_match', message: `No unmatched lines carry ${code}.` } as const;
    const cents = done.reduce((a, r) => a + n(r.amount_cents), 0);
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-STM-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'income_lines.matched', ${code},
              ${tx.json({ recording: recordingId, lines: done.length, cents })})`;
    return { ok: true, royalties: await royaltiesIn(tx) } as const;
  });
}

type StRow = {
  ref: string; payee: string; payee_slug: string; release: string | null; period: Date; version: number | null;
  pays_on: Date; pay_run: string | null; rows: WaterfallRow[]; net_cents: string; audit_ref: string;
  simple: { label: string; amount: number }[]; qa: Statement['qa'] | null; release_uuid: string | null; period_iso: string;
};

const statementRows = (tx: Tx, ref?: string) => tx<StRow[]>`
  SELECT s.ref, p.name AS payee, p.slug AS payee_slug, rl.title AS release, s.period, v.version, s.pays_on, s.pay_run,
         s.rows, s.net_cents, s.audit_ref, s.simple, s.qa, s.release_id AS release_uuid, to_char(s.period, 'YYYY-MM-DD') AS period_iso
  FROM payee_statements s
  JOIN parties p ON p.id = s.party_id
  LEFT JOIN releases rl ON rl.id = s.release_id
  LEFT JOIN split_versions v ON v.id = s.version_id
  WHERE ${ref ?? null}::text IS NULL OR s.ref = ${ref ?? null}
  ORDER BY s.period DESC, s.issued_at, s.ref`;

const payDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function toStatement(r: StRow): Statement {
  const net = n(r.net_cents);
  const problem = checkStatement(r.rows, net);
  if (problem) throw new Error(`Statement ${r.ref} fails its check (${problem}); not serving it.`);
  return {
    id: r.ref, payee: r.payee, payeeId: r.payee_slug, release: r.release ?? 'Catalog', period: periodLabel(r.period),
    split: r.version ? `split v${r.version}` : 'No split', pays: r.pay_run ? `${payDay(r.pays_on)} on the ${r.pay_run}` : payDay(r.pays_on),
    rows: r.rows, net, auditId: r.audit_ref, simple: r.simple, ...(r.qa ? { qa: r.qa } : {}),
  };
}

/** Payee statements the signed-in user may read. Row-level security limits a payee to their own. */
export function liveStatements(ctx: RequestContext): Promise<StatementSummary[]> {
  return withTenant(sql, ctx, async (tx) => (await statementRows(tx)).map(toStatement).map(({ id, payee, payeeId, release, period, net, pays }) => ({ id, payee, payeeId, release, period, net, pays })));
}

/** One statement. If a recording it pays from is flagged, the part held in reserve is shown with it. */
export function liveStatement(ctx: RequestContext, ref: string): Promise<Statement | null> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = await statementRows(tx, ref);
    if (!r) return null;
    const st = toStatement(r);
    const h = heldFor(await holdsIn(tx), r.release_uuid, r.period_iso, st.net);
    return h.held ? { ...st, held: { amount: h.held, note: heldNote(h.held, h.recordings) } } : st;
  });
}
