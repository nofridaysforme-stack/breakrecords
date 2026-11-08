// Loads the Northline sample world into a database for local development, previews and
// staging. Never production: it refuses unless BR_ALLOW_SEED=1, and it only ever writes the
// sample tenants. Run with the owner connection: SEED_DATABASE_URL=... pnpm db:seed
import { connect } from '@breakrecords/db/client';
import { approvals as items } from '../src/data/sample';
import { approvalDetails } from '../src/data/fixtures';
import { catalogAssets, catalogReleases, profileClaims, recordings, regColumns, registrations, songs, unclaimed } from '../src/data/ops';
import { aiUseFromLabel } from '@breakrecords/core/metadata';
import type { Tx } from '@breakrecords/db/client';

const url = process.env.SEED_DATABASE_URL;
if (!url || process.env.BR_ALLOW_SEED !== '1') {
  console.error('Set SEED_DATABASE_URL (owner role) and BR_ALLOW_SEED=1. Never run this against production.');
  process.exit(1);
}

// Who can sign in to the sample world. E2E addresses receive links in the test mailbox.
const PEOPLE = (process.env.SEED_EMAILS ?? 'jana@northline.example:northline:owner,e2e-owner@northline.example:northline:owner,e2e-harbor@harbor.example:harbor-sound:owner,e2e-payee@northline.example:northline:payee')
  .split(',').map((s) => { const [email, tenant, role] = s.split(':'); return { email: email.toLowerCase(), tenant, role }; });

const DUE: Record<string, string> = { apr_payout_oct: '2026-11-10', apr_producer: '2026-11-09', apr_mlc: '2026-11-12', apr_grant: '2026-11-15' };

async function main() {
  const sql = connect(url!, { max: 1 });
  await sql.begin(async (tx) => {
    const tenant = async (slug: string, name: string, kind: string, parent: string | null) => {
      const [row] = await tx`INSERT INTO tenants (slug, name, kind, parent_id) VALUES (${slug}, ${name}, ${kind}, ${parent})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id RETURNING id`;
      return row.id as string;
    };
    // 5i: Harbor Sound licenses the platform; Northline Records is one of its sub-tenants.
    const licensee = await tenant('harbor-sound-licensee', 'Harbor Sound', 'licensee', null);
    const ids: Record<string, string> = {
      northline: await tenant('northline', 'Northline Records', 'label', licensee),
      'harbor-sound': await tenant('harbor-sound', 'Harbor Sound', 'label', licensee),
    };

    for (const p of PEOPLE) {
      await tx`INSERT INTO allowlist (email, tenant_id, role) VALUES (${p.email}, ${ids[p.tenant]}, ${p.role}) ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role`;
    }

    // Agent-prepared approvals with what the person is shown, frozen in `detail`.
    await tx`DELETE FROM approvals WHERE tenant_id = ${ids.northline} AND origin = 'agent'`;
    for (const a of items) {
      const d = approvalDetails[a.id];
      const detail = d ? { breadcrumb: d.breadcrumb, outcome: d.outcome, primaryLabel: d.primaryLabel, rejectLabel: d.rejectLabel, evidence: d.evidence, body: d.body } : null;
      await tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, due_on, impact, risk, context, risk_label, detail)
        VALUES (${ids.northline}, ${a.id}, 'agent', ${a.type}, ${a.title}, ${a.agent}, ${a.due}, ${DUE[a.id] ?? null}, ${a.impact}, ${a.risk},
                ${a.context ?? null}, ${a.riskLabel ?? null}, ${detail ? tx.json(detail as never) : null})`;
    }
    // A second label with its own approval, so cross-tenant checks have something to miss.
    await tx`DELETE FROM approvals WHERE tenant_id = ${ids['harbor-sound']} AND origin = 'agent'`;
    await tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, due_on, impact, risk, context)
      VALUES (${ids['harbor-sound']}, 'apr_harbor_payout', 'agent', 'money', 'Payout batch for October', 'Royalties Agent', 'Nov 12', '2026-11-12', '$842.10 to 4 payees', 'low', 'October statements')`;
    await seedCatalog(tx, ids.northline);
    await seedRights(tx, ids.northline);
    await seedHarborCatalog(tx, ids['harbor-sound']);
  });
  console.log(`Seeded Northline and Harbor Sound; ${PEOPLE.length} people allowlisted.`);
  await sql.end();
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seconds = (d: string) => { const [m, x] = d.split(':').map(Number); return m * 60 + x; };

// What the agents are doing about each recording's gaps (the second half of each 5a note).
const AGENT_NOTES: Record<string, string> = {
  glasshouse: 'Publishing Agent will add it once the MLC filing is confirmed.',
  'static-hymn': 'Publishing Agent will add the ISWC after the MLC filing.',
  'low-light': 'Metadata Agent asked Marco Dela for the credits.',
  'night-bus-demo': 'Demos often stay off stores.',
};
// Which songs have lyrics on file, and whose writer shares are signed (5b: Night Bus split sheet signed; Glasshouse 1 of 2).
const LYRICS = new Set(['glasshouse', 'night-bus', 'velvet-hours']);
const SIGNED = new Set(['night-bus', 'velvet-hours', 'paper-moons']);
const ARTIST_TYPE: Record<string, 'person' | 'group'> = { 'The Low Hours': 'group' };
const RELEASE_TRACKS: Record<string, { kind: 'single' | 'ep' | 'album'; date: string; tracks: string[] }> = {
  rel_glasshouse: { kind: 'single', date: '2027-03-05', tracks: ['glasshouse'] },
  rel_nightbus: { kind: 'ep', date: '2025-06-13', tracks: ['night-bus', 'static-hymn'] },
  rel_velvet: { kind: 'album', date: '2024-09-20', tracks: ['velvet-hours', 'paper-moons'] },
};
const ASSET_KIND = (name: string, kind: string) =>
  /cover/i.test(name) ? 'cover_art' : /press photo/i.test(name) ? 'press_photo' : /stems/i.test(name) ? 'stems'
  : /instrumental/i.test(name) ? 'instrumental' : /lyrics/i.test(name) ? 'lyrics' : /audio|wav/i.test(kind + name) ? 'master_audio' : 'document';

/** The Northline catalog from the 5a, 5b and 5c sample data. Replaces the tenant's catalog rows. */
async function seedCatalog(tx: Tx, tenant: string) {
  for (const t of ['registrations', 'assets', 'release_tracks', 'releases', 'recording_credits', 'recordings', 'work_writers', 'works', 'parties']) {
    await tx.unsafe(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenant]);
  }
  const party = new Map<string, string>();
  const partyId = async (name: string) => {
    if (!party.has(name)) {
      const [r] = await tx`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${tenant}, ${slugify(name)}, ${name}, ${ARTIST_TYPE[name] ?? 'person'}) RETURNING id`;
      party.set(name, r.id);
    }
    return party.get(name)!;
  };

  const work = new Map<string, string>();
  for (const s of songs) {
    const [w] = await tx`INSERT INTO works (tenant_id, slug, title, iswc, has_lyrics) VALUES (${tenant}, ${s.id}, ${s.title}, ${s.iswc}, ${LYRICS.has(s.id)}) RETURNING id`;
    work.set(s.id, w.id);
    for (const part of s.writers.split(',').map((x) => x.trim())) {
      const m = /^(.*) (\d+)%$/.exec(part);
      if (!m) continue;
      await tx`INSERT INTO work_writers (tenant_id, work_id, party_id, share_bp, confirmed) VALUES (${tenant}, ${w.id}, ${await partyId(m[1])}, ${Number(m[2]) * 100}, ${SIGNED.has(s.id)})`;
    }
  }

  const rec = new Map<string, string>();
  for (const r of recordings) {
    const songSlug = songs.find((s) => s.title === r.song)?.id;
    const [row] = await tx`INSERT INTO recordings (tenant_id, slug, title, work_id, artist_id, isrc, duration_s, genre, ai_use, agent_note)
      VALUES (${tenant}, ${r.id}, ${r.title}, ${songSlug ? work.get(songSlug)! : null}, ${await partyId(r.artist)}, ${r.isrc}, ${seconds(r.duration)},
              ${r.genre}, ${aiUseFromLabel(r.ai) ?? 'undeclared'}, ${AGENT_NOTES[r.id] ?? null}) RETURNING id`;
    rec.set(r.id, row.id);
    let pos = 0;
    for (const c of r.credits) {
      await tx`INSERT INTO recording_credits (tenant_id, recording_id, party_id, role, position) VALUES (${tenant}, ${row.id}, ${await partyId(c.name)}, ${c.role}, ${pos++})`;
    }
  }

  const rel = new Map<string, string>();
  for (const r of catalogReleases) {
    const plan = RELEASE_TRACKS[r.id];
    const [row] = await tx`INSERT INTO releases (tenant_id, slug, title, kind, artist_id, upc, release_date)
      VALUES (${tenant}, ${r.id}, ${r.title}, ${plan.kind}, ${await partyId(r.artist)}, ${r.upc}, ${plan.date}) RETURNING id`;
    rel.set(r.title, row.id);
    let pos = 1;
    for (const t of plan.tracks) await tx`INSERT INTO release_tracks (tenant_id, release_id, recording_id, position) VALUES (${tenant}, ${row.id}, ${rec.get(t)!}, ${pos++})`;
  }
  // The single's release name is the recording title; the 5a "Glasshouse" release also matches assets by title.
  for (const a of catalogAssets) {
    const detail = a.kind.includes('·') ? a.kind.split('·')[1].trim() : null;
    const releaseId = rel.get(a.release) ?? null;
    const recordingId = a.release === 'Not assigned' && /low light/i.test(a.name) ? rec.get('low-light')! : null;
    await tx`INSERT INTO assets (tenant_id, name, kind, detail, release_id, recording_id, ready)
      VALUES (${tenant}, ${a.name}, ${ASSET_KIND(a.name, a.kind)}, ${detail}, ${releaseId}, ${recordingId}, ${a.ready})`;
  }

  // 5c registrations matrix: songs register with PRO and MLC, recordings with the rest.
  const ORG: Record<string, string> = { pro: 'pro', mlc: 'mlc', sxOwner: 'sx_owner', sxArtist: 'sx_artist', copyright: 'copyright', neighboring: 'neighboring' };
  for (const row of registrations) {
    for (const [i, cell] of row.cells.entries()) {
      const org = ORG[regColumns[i].key];
      const onWork = org === 'pro' || org === 'mlc';
      const workId = onWork ? work.get(row.id) : null;
      const recordingId = onWork ? null : rec.get(row.id);
      if (!workId && !recordingId) continue;
      await tx`INSERT INTO registrations (tenant_id, org, work_id, recording_id, status, ref)
        VALUES (${tenant}, ${org}, ${workId ?? null}, ${recordingId ?? null}, ${cell.status}, ${cell.ref ?? null})`;
    }
  }
}

/** Unclaimed royalties and profile claims from the Rights tabs' sample data. */
async function seedRights(tx: Tx, tenant: string) {
  await tx`DELETE FROM unclaimed_royalties WHERE tenant_id = ${tenant}`;
  await tx`DELETE FROM profile_claims WHERE tenant_id = ${tenant}`;
  const [song] = await tx`SELECT id FROM works WHERE tenant_id = ${tenant} AND slug = 'night-bus'`;
  const [rec] = await tx`SELECT id FROM recordings WHERE tenant_id = ${tenant} AND slug = 'night-bus'`;
  const HELD: Record<string, string> = { unc_sx: '2026-07-01', unc_mlc: '2026-08-01' };
  for (const u of unclaimed.items) {
    const source = u.source === 'MLC' ? 'mlc' : 'soundexchange';
    await tx`INSERT INTO unclaimed_royalties (tenant_id, slug, source, work_id, recording_id, what, why, amount_cents, held_since, claim_method)
      VALUES (${tenant}, ${u.id}, ${source}, ${source === 'mlc' ? song.id : null}, ${source === 'mlc' ? null : rec.id}, ${u.what}, ${u.why}, ${u.amount}, ${HELD[u.id]}, ${u.claim})`;
  }
  const SERVICE = ['spotify', 'apple_music', 'youtube', 'amazon_music'];
  for (const row of profileClaims) {
    const [p] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND name = ${row.artist}`;
    for (const [i, cell] of row.cells.entries()) {
      if (cell.status === 'notStarted') continue; // no row means not started
      await tx`INSERT INTO profile_claims (tenant_id, party_id, service, status, ref) VALUES (${tenant}, ${p.id}, ${SERVICE[i]}, ${cell.status}, ${cell.ref ?? null})`;
    }
  }
}

/** A small, different catalog for the second label, so cross-tenant checks have something to miss. */
async function seedHarborCatalog(tx: Tx, tenant: string) {
  for (const t of ['registrations', 'assets', 'release_tracks', 'releases', 'recording_credits', 'recordings', 'work_writers', 'works', 'parties']) {
    await tx.unsafe(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenant]);
  }
  const [artist] = await tx`INSERT INTO parties (tenant_id, slug, name) VALUES (${tenant}, 'mara-quill', 'Mara Quill') RETURNING id`;
  const [w] = await tx`INSERT INTO works (tenant_id, slug, title) VALUES (${tenant}, 'tidal-lines', 'Tidal Lines') RETURNING id`;
  await tx`INSERT INTO recordings (tenant_id, slug, title, work_id, artist_id, isrc, duration_s, genre, ai_use)
    VALUES (${tenant}, 'tidal-lines', 'Tidal Lines', ${w.id}, ${artist.id}, 'USHS12600001', 201, 'Folk', 'none')`;
}

main().catch((e) => { console.error(e); process.exit(1); });
