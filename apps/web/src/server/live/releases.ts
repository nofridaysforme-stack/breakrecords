import 'server-only';
import { toIso } from '@breakrecords/core/dates';
import { deliveryBlockers, phaseDate, phaseStatus, releaseStatus, type TaskState, syncTaskState } from '@breakrecords/core/runbook';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { budgets as sampleBudgets } from '@/data/money';
import type { Release } from '@/data/types';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Budgets = typeof sampleBudgets;
const n = (v: unknown) => Number(v ?? 0);
const KIND: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album' };
const ASSET_KIND: Record<string, string> = { master_audio: 'audio', instrumental: 'audio', stems: 'audio', lyrics: 'text', press_photo: 'photo', document: 'document', cover_art: 'image' };
// The runbook's registration rows, in order: which body, and whether it files the song or the recording.
const REGS: { org: string; name: string; on: 'work' | 'recording' | 'either'; term?: 'PRO' | 'MLC' | 'SoundExchange' }[] = [
  { org: 'pro', name: 'PRO', on: 'work', term: 'PRO' }, { org: 'mlc', name: 'MLC', on: 'work', term: 'MLC' },
  { org: 'sx_owner', name: 'SoundExchange owner', on: 'recording', term: 'SoundExchange' },
  { org: 'sx_artist', name: 'SoundExchange artist', on: 'recording', term: 'SoundExchange' },
  { org: 'copyright', name: 'Copyright Office', on: 'either' },
];

type Row = { id: string; slug: string; title: string; kind: string; artist: string; release_date: Date | null; planned_date: Date | null };

/** The releases that have a runbook, with the date an approved plan moved them to. */
const releaseRows = (tx: Tx, slug?: string) => tx<Row[]>`
  SELECT r.id, r.slug, r.title, r.kind::text AS kind, p.name AS artist, r.release_date,
         (SELECT a.new_date FROM approvals a JOIN approval_decisions d ON d.tenant_id = a.tenant_id AND d.approval_id = a.id
            WHERE a.type = 'plan' AND a.release_id = r.slug AND a.new_date IS NOT NULL AND d.status = 'approved'
            ORDER BY d.decided_at DESC LIMIT 1) AS planned_date
  FROM releases r JOIN parties p ON p.id = r.artist_id
  WHERE EXISTS (SELECT 1 FROM runbook_phases ph WHERE ph.release_id = r.id) AND (${slug ?? null}::text IS NULL OR r.slug = ${slug ?? null})
  ORDER BY r.release_date NULLS LAST, r.created_at`;

async function build(tx: Tx, r: Row, today: string): Promise<Release> {
  const date = toIso(r.planned_date ?? r.release_date ?? new Date());
  const phases = await tx<{ id: string; name: string; starts_on: Date | null; offset_days: number | null; until: boolean }[]>`
    SELECT id, name, starts_on, offset_days, until FROM runbook_phases WHERE release_id = ${r.id} ORDER BY position`;
  const stored = await tx<{ phase_id: string; title: string; owner: string; state: TaskState; gate_owner: string | null; gate_waiting_on: string | null; blocks_delivery: string | null }[]>`
    SELECT t.phase_id, t.title, t.owner, t.state::text AS state, t.gate_owner, t.gate_waiting_on, t.blocks_delivery
    FROM runbook_tasks t JOIN runbook_phases ph ON ph.id = t.phase_id WHERE ph.release_id = ${r.id} ORDER BY ph.position, t.position`;
  // Code tasks follow the catalog: a UPC on the release and an ISRC on every track mark them done.
  const [codes] = await tx<{ assigned: boolean }[]>`
    SELECT rel.upc IS NOT NULL AND EXISTS (SELECT 1 FROM release_tracks t WHERE t.release_id = rel.id)
      AND NOT EXISTS (SELECT 1 FROM release_tracks t JOIN recordings rec ON rec.id = t.recording_id WHERE t.release_id = rel.id AND rec.isrc IS NULL) AS assigned
    FROM releases rel WHERE rel.id = ${r.id}`;
  const tasks = stored.map((t) => ({ ...t, state: syncTaskState(t.title, t.state, { codesAssigned: !!codes?.assigned }) }));
  const [money] = await tx<{ planned: string; spent: string }[]>`
    SELECT coalesce(sum(planned_cents), 0) AS planned, coalesce(sum(spent_cents), 0) AS spent FROM release_budget_lines WHERE release_id = ${r.id}`;
  const assets = await tx<{ name: string; kind: string; detail: string | null; ready: boolean }[]>`
    SELECT name, kind::text AS kind, detail, ready FROM assets WHERE release_id = ${r.id} ORDER BY created_at`;
  // Credits are ready when every track credits someone besides its artist.
  const [credits] = await tx<{ ready: boolean }[]>`
    SELECT coalesce(bool_and(EXISTS (SELECT 1 FROM recording_credits c WHERE c.recording_id = rec.id AND c.party_id <> rec.artist_id)), false) AS ready
    FROM release_tracks t JOIN recordings rec ON rec.id = t.recording_id WHERE t.release_id = ${r.id}`;
  const regs = await tx<{ org: string; status: Release['registrations'][number]['status']; on_work: boolean }[]>`
    SELECT g.org::text AS org, g.status::text AS status, g.work_id IS NOT NULL AS on_work
    FROM release_tracks t JOIN recordings rec ON rec.id = t.recording_id
    JOIN registrations g ON g.recording_id = rec.id OR g.work_id = rec.work_id
    WHERE t.release_id = ${r.id} AND t.position = 1`;
  const [pitch] = await tx<{ text: string; char_limit: number }[]>`SELECT text, char_limit FROM release_pitches WHERE release_id = ${r.id}`;

  const strip = (name: string) => {
    const short = name.replace(new RegExp(`^(${r.title}|${r.artist})\\s+`, 'i'), '');
    return short.charAt(0).toUpperCase() + short.slice(1);
  };
  const runbook = phases.map((p) => {
    const iso = phaseDate(date, { startsOn: p.starts_on ? toIso(p.starts_on) : null, offsetDays: p.offset_days });
    const mine = tasks.filter((t) => t.phase_id === p.id);
    return {
      name: p.name, iso, ...(p.until ? { until: true } : {}), status: phaseStatus(iso, mine, today),
      tasks: mine.map((t) => ({ title: t.title, owner: t.owner, state: t.state, ...(t.gate_owner ? { gate: { owner: t.gate_owner, ...(t.gate_waiting_on ? { waitingOn: t.gate_waiting_on } : {}) } } : {}) })),
    };
  });
  const budget = n(money.planned); const spent = n(money.spent);
  return {
    id: r.slug, title: r.title, kind: KIND[r.kind] ?? r.kind, artist: r.artist, date,
    status: releaseStatus(runbook, spent, budget, today),
    budget, spent, phases: runbook,
    assets: [
      ...assets.map((a) => ({ name: strip(a.name), kind: a.kind === 'cover_art' && a.detail ? a.detail : ASSET_KIND[a.kind] ?? a.kind, ready: a.ready })),
      { name: 'Credits', kind: 'text', ready: !!credits?.ready },
    ],
    registrations: REGS.map((g) => {
      const hit = regs.find((x) => x.org === g.org && (g.on === 'either' || (g.on === 'work') === x.on_work));
      return { name: g.name, status: hit?.status ?? 'notStarted', ...(g.term ? { term: g.term } : {}) };
    }),
    pitch: { text: pitch?.text ?? '', limit: pitch?.char_limit ?? 500 },
    blockers: deliveryBlockers(tasks.map((t) => ({ state: t.state, blocksDelivery: t.blocks_delivery }))),
  };
}

const todayIso = () => toIso(new Date());

export function liveReleases(ctx: RequestContext): Promise<Release[]> {
  return withTenant(sql, ctx, async (tx) => {
    const today = todayIso();
    const out: Release[] = [];
    for (const r of await releaseRows(tx)) out.push(await build(tx, r, today));
    return out;
  });
}

export function liveRelease(ctx: RequestContext, slug: string): Promise<Release | null> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = await releaseRows(tx, slug);
    return r ? build(tx, r, todayIso()) : null;
  });
}

/** Budgets: each release's planned and spent lines; the budget is what's planned. */
export function liveBudgets(ctx: RequestContext): Promise<Budgets> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ slug: string; title: string; lines: { category: string; planned: number; spent: number }[] }[]>`
      SELECT r.slug, r.title, json_agg(json_build_object('category', b.category, 'planned', b.planned_cents, 'spent', b.spent_cents) ORDER BY b.position) AS lines
      FROM release_budget_lines b JOIN releases r ON r.id = b.release_id GROUP BY r.id, r.slug, r.title ORDER BY min(r.created_at)`;
    return rows.map((r) => {
      const lines = r.lines.map((l) => ({ category: l.category, planned: n(l.planned), spent: n(l.spent) }));
      return { id: r.slug, title: r.title, budget: lines.reduce((a, l) => a + l.planned, 0), lines };
    });
  });
}
