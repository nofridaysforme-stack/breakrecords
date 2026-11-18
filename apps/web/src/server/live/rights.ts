import 'server-only';
import type { z } from 'zod';
import type { Proposal, RegistrationActionCommand } from '@breakrecords/contract';
import { FORM_FOR, ON_WORK, ORG_LABEL, ORGS, REF_LABEL, filingFacts, filingOutcome, regState, type FilingSubject, type RegOrg, type RegStatus } from '@breakrecords/core/registrations';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { liveApprovals } from './approvals';
import type { getProfileClaims, getRegistrations, getUnclaimed } from '@/data/api';
import { regColumns, profileServices } from '@/data/ops';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Registrations = Awaited<ReturnType<typeof getRegistrations>>;
type Unclaimed = Awaited<ReturnType<typeof getUnclaimed>>;
type Claims = Awaited<ReturnType<typeof getProfileClaims>>;
type Cell = Registrations['rows'][number]['cells'][number];

// Column order matches 5c. Songs register with PRO and MLC; the rest attach to the recording.
const dateLabel = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : undefined);

type RegRowDb = { org: RegOrg; work_id: string | null; recording_id: string | null; status: RegStatus; ref: string | null; approval_id: string | null;
  submitted_on: Date | null; submit_ref: string | null; confirmed_on: Date | null; decision: 'approved' | 'rejected' | null; reason: string | null };

/** One cell: the registration read through its filing card, with what to do next. */
function cellOf(org: RegOrg, g: RegRowDb | undefined, target: Cell['target']): Cell {
  const st = regState(g ? { status: g.status, approvalId: g.approval_id, decision: g.decision, rejectReason: g.reason } : null);
  return {
    status: st.status, label: st.label, ...(st.note ? { note: st.note } : {}),
    next: target ? st.next : null, target, form: FORM_FOR[org], refLabel: REF_LABEL[org],
    ...(g?.ref ? { ref: g.ref } : {}), ...(g?.approval_id ? { approvalId: g.approval_id } : {}),
    ...(g?.submitted_on ? { submittedOn: dateLabel(g.submitted_on) } : {}), ...(g?.submit_ref ? { submitRef: g.submit_ref } : {}),
    ...(g?.confirmed_on ? { confirmedOn: dateLabel(g.confirmed_on) } : {}),
  };
}

async function registrationsIn(tx: Tx): Promise<Registrations> {
  const recs = await tx<{ id: string; slug: string; title: string; artist: string; work_id: string | null; work_slug: string | null; work_title: string | null }[]>`
    SELECT r.id, r.slug, r.title, a.name AS artist, r.work_id, w.slug AS work_slug, w.title AS work_title
    FROM recordings r JOIN parties a ON a.id = r.artist_id LEFT JOIN works w ON w.id = r.work_id
    WHERE EXISTS (SELECT 1 FROM release_tracks t WHERE t.recording_id = r.id)
       OR EXISTS (SELECT 1 FROM registrations g WHERE g.recording_id = r.id)
    ORDER BY r.created_at, r.slug`;
  const regs = await tx<RegRowDb[]>`
    SELECT g.org::text AS org, g.work_id, g.recording_id, g.status::text AS status, g.ref, g.approval_id, g.submitted_on, g.submit_ref, g.confirmed_on,
           d.status::text AS decision, d.reason
    FROM registrations g LEFT JOIN approval_decisions d ON d.tenant_id = g.tenant_id AND d.approval_id = g.approval_id`;
  const find = (org: RegOrg, workId: string | null, recId: string) =>
    regs.find((g) => g.org === org && (ON_WORK.has(org) ? g.work_id === workId && !!workId : g.recording_id === recId));
  return {
    columns: regColumns,
    rows: recs.map((r) => ({
      id: r.slug, name: r.title, artist: r.artist,
      cells: ORGS.map((org) => cellOf(org, find(org, r.work_id, r.id),
        ON_WORK.has(org) ? (r.work_slug ? { subject: 'work' as const, id: r.work_slug, title: r.work_title! } : null) : { subject: 'recording' as const, id: r.slug, title: r.title })),
    })),
  };
}

/**
 * The registrations matrix: every recording that is on a release or has a filing of its own,
 * so an unregistered release shows up as a row of "Not started" instead of being missing. A
 * demo that only shares its song with a released recording stays out.
 */
export function liveRegistrations(ctx: RequestContext): Promise<Registrations> {
  return withTenant(sql, ctx, registrationsIn);
}

export type RegOutcome = { ok: true; value: Registrations } | { ok: false; status: number; error: 'not_found' | 'conflict' | 'invalid'; message: string };
type RegCommand = z.infer<typeof RegistrationActionCommand>;

/** Prepare a filing (an approval card with the facts to confirm), record it submitted, or record its confirmation. */
export async function liveRegistrationAction(ctx: RequestContext, c: RegCommand): Promise<RegOutcome> {
  if (ON_WORK.has(c.org) !== (c.subject === 'work')) return { ok: false, status: 400, error: 'invalid', message: ON_WORK.has(c.org) ? 'A song registers with that organization, not a recording.' : 'A recording registers with that organization, not a song.' };
  const pre = await withTenant(sql, ctx, async (tx) => {
    const [t] = c.subject === 'work'
      ? await tx<{ id: string; title: string; iswc: string | null; isrc: string | null; artist: string; owner: string | null; writers: string; existing: number }[]>`
          SELECT w.id, w.title, w.iswc, (SELECT r.isrc FROM recordings r WHERE r.work_id = w.id AND r.isrc IS NOT NULL ORDER BY r.created_at LIMIT 1) AS isrc,
                 coalesce((SELECT a.name FROM recordings r JOIN parties a ON a.id = r.artist_id WHERE r.work_id = w.id ORDER BY r.created_at LIMIT 1), '') AS artist, NULL AS owner,
                 coalesce((SELECT string_agg(p.name || ' ' || to_char(ww.share_bp / 100.0, 'FM990.99') || '%', ', ' ORDER BY ww.share_bp DESC, p.name) FROM work_writers ww JOIN parties p ON p.id = ww.party_id WHERE ww.work_id = w.id), '') AS writers,
                 (SELECT count(*)::int FROM approvals x WHERE x.id LIKE ${'reg_' + c.org + '_' + c.id + '%'}) AS existing
          FROM works w WHERE w.slug = ${c.id}`
      : await tx<{ id: string; title: string; iswc: string | null; isrc: string | null; artist: string; owner: string | null; writers: string; existing: number }[]>`
          SELECT r.id, r.title, NULL AS iswc, r.isrc, a.name AS artist, o.name AS owner, '' AS writers,
                 (SELECT count(*)::int FROM approvals x WHERE x.id LIKE ${'reg_' + c.org + '_' + c.id + '%'}) AS existing
          FROM recordings r JOIN parties a ON a.id = r.artist_id LEFT JOIN parties o ON o.id = r.owner_id WHERE r.slug = ${c.id}`;
    if (!t) return null;
    const [g] = await tx<RegRowDb[]>`
      SELECT g.org::text AS org, g.work_id, g.recording_id, g.status::text AS status, g.ref, g.approval_id, g.submitted_on, g.submit_ref, g.confirmed_on, d.status::text AS decision, d.reason
      FROM registrations g LEFT JOIN approval_decisions d ON d.tenant_id = g.tenant_id AND d.approval_id = g.approval_id
      WHERE g.org = ${c.org} AND ${c.subject === 'work' ? tx`g.work_id = ${t.id}` : tx`g.recording_id = ${t.id}`}`;
    return { t, g };
  });
  if (!pre) return { ok: false, status: 404, error: 'not_found', message: 'No such song or recording.' };
  const { t, g } = pre;
  const st = regState(g ? { status: g.status, approvalId: g.approval_id, decision: g.decision } : null);
  const refuse = (message: string) => ({ ok: false as const, status: 409, error: 'conflict' as const, message });
  if (st.next !== c.action) {
    if (c.action === 'prepare') return refuse(st.next === 'approve' ? 'A filing for this is already waiting on approval.' : `This is already ${st.label.toLowerCase()}.`);
    if (c.action === 'submitted') return refuse(st.next === 'approve' ? 'Approve the filing first, then submit it and record it here.' : 'Prepare and approve a filing first.');
    return refuse('Record the submission first.');
  }

  let approvalId: string | null = null;
  if (c.action === 'prepare') {
    approvalId = `reg_${c.org}_${c.id}${t.existing ? `_${t.existing + 1}` : ''}`;
    const subject: FilingSubject = { title: t.title, artist: t.artist, isrc: t.isrc, iswc: t.iswc, writers: t.writers, owner: t.owner };
    const proposal: Proposal = {
      id: approvalId, type: 'filing', title: `Register ${t.title} with ${ORG_LABEL[c.org]}`, agent: 'Rights Agent', due: 'This week',
      impact: ON_WORK.has(c.org) ? 'Royalties for the song get paid' : 'Royalties for the recording get paid', risk: 'needsEyes', riskLabel: 'Filing', context: 'Registration',
      href: '/rights/registrations', dept: 'Rights',
    };
    const out = await liveApprovals(ctx).propose(proposal);
    if (!out.ok) return refuse(out.message);
    // The card shows what's being filed and the facts to confirm; for songs, the PRO and MLC checks run on it.
    const detail = {
      breadcrumb: 'Filing', outcome: { text: filingOutcome(c.org, t.title) }, primaryLabel: 'Approve the filing', rejectLabel: 'Reject with reason',
      evidence: { whyLabel: 'Why this filing', why: `${t.title} isn't registered with ${ORG_LABEL[c.org]} yet, so royalties it earns there can go unpaid.`,
        inputs: [{ label: 'Prepared form', ref: FORM_FOR[c.org] ? 'Rights › Documents' : 'None yet', href: '/rights/documents' }, { label: 'Registrations', ref: ORG_LABEL[c.org], href: '/rights/registrations' }],
        steps: ['Checked the catalog for the facts this filing needs', 'Listed the facts only you can confirm'], auditId: `AUD-REG-${crypto.randomUUID().slice(0, 8).toUpperCase()}` },
      body: { kind: 'filing', org: ORG_LABEL[c.org], works: [{ title: t.title, writers: t.writers || t.artist, isrc: t.isrc ?? 'None yet', iswc: t.iswc ?? (ON_WORK.has(c.org) ? 'Assigned after filing' : 'Not a song') }],
        facts: filingFacts(c.org, subject, ctx.tenantName) },
    };
    await withTenant(sql, ctx, (tx) => tx`UPDATE approvals SET detail = ${tx.json(detail as never)} WHERE id = ${approvalId}`);
  }

  return withTenant(sql, ctx, async (tx) => {
    const col = c.subject === 'work' ? tx`work_id` : tx`recording_id`;
    if (c.action === 'prepare') {
      if (g) await tx`UPDATE registrations SET status = 'needsYou', approval_id = ${approvalId} WHERE org = ${c.org} AND ${col} = ${t.id}`;
      else await tx`INSERT INTO registrations (tenant_id, org, ${col}, status, approval_id) VALUES (${ctx.tenantId}, ${c.org}, ${t.id}, 'needsYou', ${approvalId})`;
    } else if (c.action === 'submitted') {
      await tx`UPDATE registrations SET status = 'submitted', submitted_on = ${c.on}, submit_ref = ${c.reference || null} WHERE org = ${c.org} AND ${col} = ${t.id}`;
    } else {
      await tx`UPDATE registrations SET status = 'confirmed', ref = ${c.reference}, confirmed_on = ${c.on ?? null} WHERE org = ${c.org} AND ${col} = ${t.id}`;
      // A PRO or The MLC may give the song its ISWC; keep it on the song if it has none.
      if (c.iswc && c.subject === 'work') await tx`UPDATE works SET iswc = ${c.iswc} WHERE id = ${t.id} AND iswc IS NULL`;
    }
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-REG-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${'registration.' + c.action}, ${c.id},
              ${tx.json({ org: ORG_LABEL[c.org], title: t.title, ...(approvalId ? { approvalId } : {}), ...('reference' in c && c.reference ? { reference: c.reference } : {}) })})`;
    return { ok: true, value: await registrationsIn(tx) } as const;
  });
}

const SOURCE: Record<string, string> = { soundexchange: 'SoundExchange', mlc: 'MLC', pro: 'PRO' };
const monthYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Money societies are holding for the label, still open (found, being claimed). */
export function liveUnclaimed(ctx: RequestContext): Promise<Unclaimed> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ slug: string; source: string; what: string; amount_cents: string; why: string; held_since: Date; claim_method: string }[]>`
      SELECT slug, source::text, what, amount_cents, why, held_since, claim_method FROM unclaimed_royalties
      WHERE status IN ('found', 'claim_prepared', 'claimed') ORDER BY amount_cents DESC, slug`;
    const items = rows.map((u) => ({
      id: u.slug, source: SOURCE[u.source], what: u.what, amount: Number(u.amount_cents), why: u.why, since: monthYear(u.held_since), claim: u.claim_method,
    }));
    return { total: items.reduce((n, i) => n + i.amount, 0), items };
  });
}

const SERVICES = ['spotify', 'apple_music', 'youtube', 'amazon_music'] as const;

/** Artist profiles on each service: every party that is a recording's main artist, or already has a claim. */
export function liveProfileClaims(ctx: RequestContext): Promise<Claims> {
  return withTenant(sql, ctx, async (tx) => {
    const artists = await tx<{ id: string; name: string }[]>`
      SELECT p.id, p.name FROM parties p
      WHERE EXISTS (SELECT 1 FROM recordings r WHERE r.artist_id = p.id) OR EXISTS (SELECT 1 FROM profile_claims c WHERE c.party_id = p.id)
      ORDER BY (SELECT min(r.created_at) FROM recordings r WHERE r.artist_id = p.id) NULLS LAST, p.name`;
    const claims = await tx<{ party_id: string; service: string; status: Cell['status']; ref: string | null }[]>`SELECT party_id, service::text, status::text, ref FROM profile_claims`;
    return {
      services: profileServices,
      rows: artists.map((a) => ({
        artist: a.name,
        cells: SERVICES.map((svc) => { const c = claims.find((x) => x.party_id === a.id && x.service === svc); return c ? { status: c.status, ...(c.ref ? { ref: c.ref } : {}) } : { status: 'notStarted' as const }; }),
      })),
    } as Claims;
  });
}

/** Rights Agent prepares every claim not yet started. Nothing is posted; the artist confirms by email. */
export async function livePrepareProfileClaims(ctx: RequestContext): Promise<Claims> {
  await withTenant(sql, ctx, async (tx) => {
    const res = await tx`
      INSERT INTO profile_claims (tenant_id, party_id, service, status, updated_by)
      SELECT ${ctx.tenantId}, p.id, s.service, 'prepared', ${ctx.userId}
      FROM parties p CROSS JOIN unnest(enum_range(NULL::profile_service)) AS s(service)
      WHERE EXISTS (SELECT 1 FROM recordings r WHERE r.artist_id = p.id)
      ON CONFLICT (party_id, service) DO UPDATE SET status = 'prepared', updated_by = EXCLUDED.updated_by, updated_at = now()
        WHERE profile_claims.status = 'notStarted'`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-RTS-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'profile_claims.prepared', 'all', ${tx.json({ count: res.count })})`;
  });
  return liveProfileClaims(ctx);
}
