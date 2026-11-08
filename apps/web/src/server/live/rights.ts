import 'server-only';
import { withTenant } from '@breakrecords/db/client';
import type { getProfileClaims, getRegistrations, getUnclaimed } from '@/data/api';
import { regColumns, profileServices } from '@/data/ops';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Registrations = Awaited<ReturnType<typeof getRegistrations>>;
type Unclaimed = Awaited<ReturnType<typeof getUnclaimed>>;
type Claims = Awaited<ReturnType<typeof getProfileClaims>>;
type Cell = Registrations['rows'][number]['cells'][number];

// Column order matches 5c. Songs register with PRO and MLC; the rest attach to the recording.
const ORGS = ['pro', 'mlc', 'sx_owner', 'sx_artist', 'copyright', 'neighboring'] as const;
const ON_WORK = new Set(['pro', 'mlc']);

/**
 * The registrations matrix: every recording that is on a release or has a filing of its own,
 * so an unregistered release shows up as a row of "Not started" instead of being missing. A
 * demo that only shares its song with a released recording stays out.
 */
export function liveRegistrations(ctx: RequestContext): Promise<Registrations> {
  return withTenant(sql, ctx, async (tx) => {
    const recs = await tx<{ id: string; slug: string; title: string; artist: string; work_id: string | null }[]>`
      SELECT r.id, r.slug, r.title, a.name AS artist, r.work_id
      FROM recordings r JOIN parties a ON a.id = r.artist_id
      WHERE EXISTS (SELECT 1 FROM release_tracks t WHERE t.recording_id = r.id)
         OR EXISTS (SELECT 1 FROM registrations g WHERE g.recording_id = r.id)
      ORDER BY r.created_at, r.slug`;
    const regs = await tx<{ org: string; work_id: string | null; recording_id: string | null; status: Cell['status']; ref: string | null }[]>`
      SELECT org::text, work_id, recording_id, status::text, ref FROM registrations`;
    const find = (org: string, workId: string | null, recId: string) =>
      regs.find((g) => g.org === org && (ON_WORK.has(org) ? g.work_id === workId && !!workId : g.recording_id === recId))
      ?? (org === 'copyright' ? regs.find((g) => g.org === org && !!workId && g.work_id === workId) : undefined);
    return {
      columns: regColumns,
      rows: recs.map((r) => ({
        id: r.slug, name: r.title, artist: r.artist,
        cells: ORGS.map((org) => { const g = find(org, r.work_id, r.id); return g ? { status: g.status, ...(g.ref ? { ref: g.ref } : {}) } : { status: 'notStarted' as const }; }),
      })),
    } as Registrations;
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
