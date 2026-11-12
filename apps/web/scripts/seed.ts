// Loads the Northline sample world into a database for local development, previews and
// staging. Never production: it refuses unless BR_ALLOW_SEED=1, and it only ever writes the
// sample tenants. Run with the owner connection: SEED_DATABASE_URL=... pnpm db:seed
import { SAMPLE_LYRICS, SAMPLE_MASTER_OWNER, SAMPLE_PEOPLE, SAMPLE_P_YEAR, SAMPLE_RELEASE_TRACKS, SAMPLE_SIGNED, SAMPLE_SIGNED_BY, SAMPLE_SONGS } from '../src/data/rightsDetails';
import { connect } from '@breakrecords/db/client';
import { approvals as items } from '../src/data/sample';
import { approvalDetails, releases as runbooks } from '../src/data/fixtures';
import { budgets, glasshouseDeal, statements as payeeStatements } from '../src/data/money';
import { daysBetween } from '@breakrecords/core/dates';
import { activity, advanceOffer, catalogAssets, departments, catalogReleases, contracts, funding, harborTheme, integrations, labelConfig, routing, tenant, offerAssumptions, offerTerms, profileClaims, saleOffer, recordings, regColumns, registrations, songs, templates, unclaimed } from '../src/data/ops';
import { aiUseFromLabel } from '@breakrecords/core/metadata';
import { checkStatement } from '@breakrecords/core/statements';
import type { Tx } from '@breakrecords/db/client';

const url = process.env.SEED_DATABASE_URL;
if (!url || process.env.BR_ALLOW_SEED !== '1') {
  console.error('Set SEED_DATABASE_URL (owner role) and BR_ALLOW_SEED=1. Never run this against production.');
  process.exit(1);
}

// Who can sign in to the sample world. E2E addresses receive links in the test mailbox.
const PEOPLE = (process.env.SEED_EMAILS ?? 'jana@northline.example:northline:owner,e2e-owner@northline.example:northline:owner,e2e-harbor@harbor.example:harbor-sound:owner,e2e-payee@northline.example:northline:payee:marco-dela,e2e-licensee@harbor.example:harbor-sound-licensee:owner')
  .split(',').map((s) => { const [email, tenant, role, party] = s.split(':'); return { email: email.toLowerCase(), tenant, role, party: (party ?? null) as string | null }; })
  // Real people who should own the sample label on staging (comma-separated addresses).
  .concat((process.env.SEED_OWNER_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    .map((email) => ({ email, tenant: 'northline', role: 'owner', party: null })));

// Indie SRVCS staff, who make invite codes: the sample owner and every real staging owner.
const STAFF = ['jana@northline.example', ...(process.env.SEED_OWNER_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)];

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
      'harbor-sound-licensee': licensee,
      northline: await tenant('northline', 'Northline Records', 'label', licensee),
      'harbor-sound': await tenant('harbor-sound', 'Harbor Sound', 'label', licensee),
    };

    for (const p of PEOPLE) {
      await tx`INSERT INTO allowlist (email, tenant_id, role, party_slug) VALUES (${p.email}, ${ids[p.tenant]}, ${p.role}, ${p.party})
        ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role, party_slug = EXCLUDED.party_slug`;
    }
    for (const email of STAFF) await tx`INSERT INTO platform_admins (email) VALUES (${email}) ON CONFLICT DO NOTHING`;

    // Payouts and statements point at parties, recordings and split versions, and batches at approvals, so they go first.
    for (const t of [ids.northline, ids['harbor-sound']]) {
      for (const table of ['payout_batches', 'payee_requests', 'payees', 'recoupment_accounts', 'payout_policies', 'agreements', 'contract_templates', 'contract_reviews', 'funding_opportunities', 'funding_questions', 'funding_assumptions']) {
        await tx.unsafe(`DELETE FROM ${table} WHERE tenant_id = $1`, [t]);
      }
      await tx`DELETE FROM payee_statements WHERE tenant_id = ${t}`;
      await tx`DELETE FROM income_statements WHERE tenant_id = ${t}`;
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
    await seedSplits(tx, ids.northline);
    await seedHarborCatalog(tx, ids['harbor-sound']);
    await seedStatements(tx, ids.northline);
    await seedHarborStatements(tx, ids['harbor-sound']);
    await seedPayouts(tx, ids.northline);
    await seedRunbooks(tx, ids.northline);
    await seedContracts(tx, ids.northline);
    await seedRoster(tx, ids.northline);
    await seedFunding(tx, ids.northline);
    await seedActivity(tx, ids.northline);
    await seedSettings(tx, ids.northline, ids['harbor-sound'], licensee);
    await seedHarborPayouts(tx, ids['harbor-sound']);
  });
  console.log(`Seeded Northline and Harbor Sound; ${PEOPLE.length} people allowlisted; ${STAFF.length} staff.`);
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
const LYRICS = SAMPLE_LYRICS;
const SIGNED = SAMPLE_SIGNED;
const SIGNED_BY = SAMPLE_SIGNED_BY;
const ARTIST_TYPE: Record<string, 'person' | 'group'> = { 'The Low Hours': 'group' };
const RELEASE_TRACKS = SAMPLE_RELEASE_TRACKS;
const ASSET_KIND = (name: string, kind: string) =>
  /cover/i.test(name) ? 'cover_art' : /press photo/i.test(name) ? 'press_photo' : /stems/i.test(name) ? 'stems'
  : /instrumental/i.test(name) ? 'instrumental' : /lyrics/i.test(name) ? 'lyrics' : /audio|wav/i.test(kind + name) ? 'master_audio' : 'document';

/** Legal names, PROs, IPIs, writer roles, publishers and master owners for documents (sample, invented). */
async function seedRightsDetails(tx: Tx, tenant: string, partyId: (name: string) => Promise<string>, work: Map<string, string>, rec: Map<string, string>) {
  for (const p of SAMPLE_PEOPLE) {
    const id = await partyId(p.name);
    await tx`UPDATE parties SET legal_name = ${p.legalName ?? null}, pro = ${p.pro ?? null}, ipi = ${p.ipi ?? null}, email = ${p.email ?? null},
      address = ${p.address ?? null}, citizenship = ${p.citizenship ?? null}, domicile = ${p.domicile ?? null}, type = ${p.type ?? 'person'} WHERE id = ${id}`;
  }
  for (const [slug, s] of Object.entries(SAMPLE_SONGS)) {
    const w = work.get(slug);
    if (!w) continue;
    await tx`UPDATE works SET completion_year = ${s.completed ?? null}, alt_titles = ${s.altTitles ?? []} WHERE id = ${w}`;
    for (const [writer, d] of Object.entries(s.writers)) {
      await tx`UPDATE work_writers SET role = ${d.role ?? null}, publisher_id = ${d.publisher ? await partyId(d.publisher) : null}
        WHERE work_id = ${w} AND party_id = ${await partyId(writer)}`;
    }
  }
  const owner = await partyId(SAMPLE_MASTER_OWNER);
  for (const [slug, id] of rec) await tx`UPDATE recordings SET owner_id = ${owner}, p_year = ${SAMPLE_P_YEAR[slug] ?? null} WHERE id = ${id}`;
}

/** The Northline catalog from the 5a, 5b and 5c sample data. Replaces the tenant's catalog rows. */
async function seedCatalog(tx: Tx, tenant: string) {
  await tx`DELETE FROM split_nodes WHERE tenant_id = ${tenant}`; // split signatures point at parties
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
      const confirmed = SIGNED.has(s.id) || SIGNED_BY.get(s.id) === m[1];
      await tx`INSERT INTO work_writers (tenant_id, work_id, party_id, share_bp, confirmed) VALUES (${tenant}, ${w.id}, ${await partyId(m[1])}, ${Number(m[2]) * 100}, ${confirmed})`;
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
  await seedRightsDetails(tx, tenant, partyId, work, rec);
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

/** The 4a split tree and Glasshouse recording versions v2 to v5 (v5 is the 95% draft), plus Night Bus v2. */
async function seedSplits(tx: Tx, tenant: string) {
  await tx`DELETE FROM split_nodes WHERE tenant_id = ${tenant}`;
  const node = async (slug: string, label: string, parent: string | null, pos: number, notes: [string, string][] = []) => {
    const [r] = await tx`INSERT INTO split_nodes (tenant_id, slug, label, parent_id, position, deal_notes)
      VALUES (${tenant}, ${slug}, ${label}, ${parent}, ${pos}, ${tx.json(notes as never)}) RETURNING id`;
    return r.id as string;
  };
  const root = await node('northline', 'Northline Records', null, 0);
  const kesi = await node('kesi', 'Kesi Vale', root, 0);
  const gh = await node('glasshouse', 'Glasshouse (single)', kesi, 0);
  const ghRec = await node('gh-rec', 'Recording income', gh, 0, glasshouseDeal.dealTerms);
  await node('gh-song', 'Song income', gh, 1);
  await node('gh-sync', 'Sync', gh, 2);
  const vh = await node('velvet', 'Velvet Hours (single)', kesi, 1);
  const vhRec = await node('vh-rec', 'Recording income', vh, 0, glasshouseDeal.dealTerms);
  const lh = await node('low-hours', 'The Low Hours', root, 1);
  const nb = await node('night-bus', 'Night Bus EP', lh, 0);
  const nbRec = await node('nb-rec', 'Recording income', nb, 0, [['Type', 'Net profit, 50/50'], ['Funded by', 'Label'], ['Advance', '$5,000, recoupable'], ['Term', '3 years from release']]);
  const marco = await node('marco', 'Marco Dela', root, 2);
  await node('marco-prod', 'Production credits', marco, 0);

  const party = async (slug: string) => (await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = ${slug}`)[0]?.id as string;
  const label = (await tx`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${tenant}, 'northline-records', 'Northline Records', 'company')
    ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`)[0].id as string;
  const who = { producer: await party('marco-dela'), label, artist: await party('kesi-vale'), feature: await party('ari-monroe') };
  const v4 = glasshouseDeal.v4.terms;
  // ASSUMED: v2 and v3 terms (4a shows only their dates); they match v4.
  const versions: { v: number; status: string; terms: object; from: string; signed?: Record<string, string> }[] = [
    { v: 2, status: 'superseded', terms: v4, from: '2026-02-12' },
    { v: 3, status: 'superseded', terms: v4, from: '2026-06-01' },
    { v: 4, status: 'in_effect', terms: v4, from: '2026-10-01', signed: { producer: '2026-09-28', label: '2026-09-26', artist: '2026-09-27', feature: '2026-09-30' } },
    { v: 5, status: 'draft', terms: glasshouseDeal.v5.terms, from: '2027-01-01' },
  ];
  for (const ver of versions) {
    const [row] = await tx`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from, created_at)
      VALUES (${tenant}, ${ghRec}, ${ver.v}, ${ver.status}, ${tx.json(ver.terms as never)}, ${ver.from}, ${ver.v === 5 ? '2026-11-06T15:00:00Z' : ver.from})
      RETURNING id`;
    for (const [role, id] of Object.entries(who)) {
      const at = ver.signed?.[role] ?? (ver.status === 'superseded' ? ver.from : null);
      await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id, signed_at) VALUES (${tenant}, ${row.id}, ${role}, ${id}, ${at})`;
    }
  }
  // Velvet Hours recording income: the same deal, v1, signed by everyone before release. ASSUMED.
  const [vhv] = await tx`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from)
    VALUES (${tenant}, ${vhRec}, 1, 'in_effect', ${tx.json(v4 as never)}, '2024-09-01') RETURNING id`;
  for (const [role, id] of Object.entries(who)) {
    await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id, signed_at) VALUES (${tenant}, ${vhv.id}, ${role}, ${id}, '2024-08-20')`;
  }
  // Night Bus recording income, v2, signed. ASSUMED: no producer points; the band shares the artist side.
  const band = await party('the-low-hours');
  const [nbv] = await tx`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from)
    VALUES (${tenant}, ${nbRec}, 2, 'in_effect', ${tx.json({ producerBp: 0, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 0 } as never)}, '2025-06-13') RETURNING id`;
  for (const [role, id] of Object.entries({ producer: band, label, artist: band, feature: band })) {
    await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id, signed_at) VALUES (${tenant}, ${nbv.id}, ${role}, ${id}, '2025-06-01')`;
  }
}

/** A small, different catalog for the second label, so cross-tenant checks have something to miss. */
async function seedHarborCatalog(tx: Tx, tenant: string) {
  await tx`DELETE FROM split_nodes WHERE tenant_id = ${tenant}`;
  for (const t of ['registrations', 'assets', 'release_tracks', 'releases', 'recording_credits', 'recordings', 'work_writers', 'works', 'parties']) {
    await tx.unsafe(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenant]);
  }
  const [artist] = await tx`INSERT INTO parties (tenant_id, slug, name) VALUES (${tenant}, 'mara-quill', 'Mara Quill') RETURNING id`;
  const [w] = await tx`INSERT INTO works (tenant_id, slug, title) VALUES (${tenant}, 'tidal-lines', 'Tidal Lines') RETURNING id`;
  await tx`INSERT INTO recordings (tenant_id, slug, title, work_id, artist_id, isrc, duration_s, genre, ai_use)
    VALUES (${tenant}, 'tidal-lines', 'Tidal Lines', ${w.id}, ${artist.id}, 'USHS12600001', 201, 'Folk', 'none')`;
}

// ---------- Statements (4b, 4c, portal) ----------
// Income lines that add up to the 4b figures: $14,286.40 for October across six sources, 1,231
// lines of which 27 are unmatched (24 carry a mistyped Night Bus ISRC), and a September of
// $12,107.12 so October reads "Up 18% on September". ASSUMED: how each source's total divides
// between recordings, stores and lines; only the totals are in the sample data.
type Bucket = { subject: ['rec' | 'work', string] | ['raw', string | null, string]; lines: number; cents: number; units?: number | 'streams' | 'sales' };
type IncomeStatement = { ref: string; source: string; period: string; received: string; buckets: Bucket[] };
const STORES = ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music', 'Tidal', 'Deezer'];
const TERRITORIES = ['US', 'GB', 'CA', 'DE', 'AU', 'FR', 'SE', 'NL', 'BR', 'JP'];
const INCOME: IncomeStatement[] = [
  { ref: 'DS-1026', source: 'distributor', period: '2026-10-01', received: '2026-11-03', buckets: [
    // Glasshouse isn't out until Mar 5, 2027, so it earns nothing yet; Velvet Hours carries October.
    { subject: ['rec', 'velvet-hours'], lines: 844, cents: 1038000, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 90, cents: 25000, units: 'streams' },
    { subject: ['rec', 'night-bus'], lines: 160, cents: 109928, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 40, cents: 15000, units: 'streams' },
    { subject: ['rec', 'static-hymn'], lines: 12, cents: 0, units: 688 },
    { subject: ['rec', 'night-bus-demo'], lines: 6, cents: 0, units: 412 },
    { subject: ['raw', 'USNL1250031', 'Night Bus'], lines: 24, cents: 3840, units: 'streams' },
    { subject: ['raw', 'QZK6P2500113', 'Lights Out (Live)'], lines: 2, cents: 190, units: 'streams' },
    { subject: ['raw', null, 'Track 07'], lines: 1, cents: 82, units: 'streams' },
  ] },
  { ref: 'SX-1026', source: 'soundexchange', period: '2026-10-01', received: '2026-11-04', buckets: [
    { subject: ['rec', 'velvet-hours'], lines: 10, cents: 7000 }, { subject: ['rec', 'paper-moons'], lines: 8, cents: 4260 },
    { subject: ['rec', 'night-bus'], lines: 12, cents: 99160 },
  ] },
  { ref: 'MLC-1026', source: 'mlc', period: '2026-10-01', received: '2026-11-05', buckets: [
    { subject: ['work', 'velvet-hours'], lines: 7, cents: 13140 },
    { subject: ['work', 'night-bus'], lines: 6, cents: 48690 },
  ] },
  { ref: 'PRO-1026', source: 'pro', period: '2026-10-01', received: '2026-11-05', buckets: [
    { subject: ['work', 'night-bus'], lines: 3, cents: 30000 }, { subject: ['work', 'static-hymn'], lines: 2, cents: 10210 },
  ] },
  { ref: 'SYNC-1026', source: 'sync', period: '2026-10-01', received: '2026-10-21', buckets: [{ subject: ['rec', 'night-bus'], lines: 1, cents: 20000 }] },
  { ref: 'BC-1026', source: 'bandcamp', period: '2026-10-01', received: '2026-11-01', buckets: [{ subject: ['rec', 'night-bus'], lines: 3, cents: 4140, units: 'sales' }] },
  { ref: 'DS-0926', source: 'distributor', period: '2026-09-01', received: '2026-10-03', buckets: [
    { subject: ['rec', 'velvet-hours'], lines: 340, cents: 1126842, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 30, cents: 20000, units: 'streams' },
    { subject: ['rec', 'night-bus'], lines: 60, cents: 50000, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 10, cents: 13870, units: 'streams' },
  ] },
];

/** Splits a total over n lines by fixed uneven weights; the remainder goes to the first line. */
function spread(total: number, n: number): number[] {
  const w = Array.from({ length: n }, (_, i) => 1 + ((i * 7919) % 97));
  const sum = w.reduce((a, b) => a + b, 0);
  const parts = w.map((x) => Math.floor((total * x) / sum));
  parts[0] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

async function insertIncome(tx: Tx, tenant: string, st: IncomeStatement) {
  const total = st.buckets.reduce((a, b) => a + b.cents, 0);
  const [row] = await tx`INSERT INTO income_statements (tenant_id, ref, source, period, received_on, total_cents)
    VALUES (${tenant}, ${st.ref}, ${st.source}, ${st.period}, ${st.received}, ${total}) RETURNING id`;
  const lines: Record<string, unknown>[] = [];
  for (const b of st.buckets) {
    let recording: string | null = null; let work: string | null = null; let isrc: string | null = null; let title: string;
    if (b.subject[0] === 'raw') { isrc = b.subject[1]; title = b.subject[2]; }
    else if (b.subject[0] === 'rec') {
      const [r] = await tx`SELECT id, title, isrc FROM recordings WHERE tenant_id = ${tenant} AND slug = ${b.subject[1]}`;
      recording = r.id; title = r.title; isrc = r.isrc;
    } else {
      const [w] = await tx`SELECT id, title FROM works WHERE tenant_id = ${tenant} AND slug = ${b.subject[1]}`;
      work = w.id; title = w.title;
    }
    const cents = spread(b.cents, b.lines);
    const units = typeof b.units === 'number' ? spread(b.units, b.lines) : null;
    cents.forEach((c, i) => {
      const n = lines.length;
      lines.push({
        tenant_id: tenant, statement_id: row.id, line_no: n + 1, title, isrc,
        store: st.source === 'distributor' ? STORES[n % STORES.length] : st.source === 'bandcamp' ? 'Bandcamp' : null,
        territory: TERRITORIES[n % TERRITORIES.length],
        units: units ? units[i] : b.units === 'streams' ? Math.round(c * 2.5) : b.units === 'sales' ? 1 : null,
        amount_cents: c, recording_id: recording, work_id: work,
      });
    });
  }
  for (let i = 0; i < lines.length; i += 500) await tx`INSERT INTO income_lines ${tx(lines.slice(i, i + 500) as never)}`;
}

const PAYS: Record<string, { on: string; run: string | null; party: string; period: string }> = {
  'ST-2026-10-KV': { on: '2027-01-15', run: 'quarterly artist run', party: 'kesi-vale', period: '2026-10-01' },
  'ST-2026-10-MD': { on: '2026-11-10', run: null, party: 'marco-dela', period: '2026-10-01' },
  'ST-2026-10-AM': { on: '2026-11-10', run: null, party: 'ari-monroe', period: '2026-10-01' },
  'ST-2026-09-MD': { on: '2026-10-10', run: null, party: 'marco-dela', period: '2026-09-01' },
};

/** Northline's income for September and October, and the three payee statements issued from it. */
async function seedStatements(tx: Tx, tenant: string) {
  for (const st of INCOME) await insertIncome(tx, tenant, st);
  const [rel] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = 'rel_velvet'`;
  const [ver] = await tx`SELECT v.id FROM split_versions v JOIN split_nodes n ON n.id = v.node_id WHERE n.tenant_id = ${tenant} AND n.slug = 'vh-rec' AND v.version = 1`;
  for (const st of Object.values(payeeStatements)) {
    const problem = checkStatement(st.rows, st.net);
    if (problem) throw new Error(`Sample statement ${st.id} fails its check: ${problem}`);
    const p = PAYS[st.id];
    const [party] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = ${p.party}`;
    await tx`INSERT INTO payee_statements (tenant_id, ref, party_id, release_id, version_id, period, pays_on, pay_run, rows, net_cents, simple, qa, audit_ref)
      VALUES (${tenant}, ${st.id}, ${party.id}, ${rel.id}, ${ver.id}, ${p.period}, ${p.on}, ${p.run}, ${tx.json(st.rows as never)}, ${st.net},
              ${tx.json(st.simple as never)}, ${st.qa ? tx.json(st.qa as never) : null}, ${st.auditId})`;
  }
}

/** One statement and one line for the second label, for cross-tenant checks. */
async function seedHarborStatements(tx: Tx, tenant: string) {
  await insertIncome(tx, tenant, { ref: 'HS-1026', source: 'distributor', period: '2026-10-01', received: '2026-11-02', buckets: [{ subject: ['rec', 'tidal-lines'], lines: 1, cents: 84210, units: 'streams' }] });
  const [party] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = 'mara-quill'`;
  const rows = [{ kind: 'start', label: 'Tidal Lines income', rule: 'Distributor, all stores', amount: 84210, source: 'HS-1026', balance: 84210 }];
  await tx`INSERT INTO payee_statements (tenant_id, ref, party_id, period, pays_on, rows, net_cents, simple, audit_ref)
    VALUES (${tenant}, 'ST-2026-10-MQ', ${party.id}, '2026-10-01', '2026-11-12', ${tx.json(rows as never)}, 84210, ${tx.json([] as never)}, 'AUD-HS-0001')`;
}

// ---------- Payouts and recoupment (4d, 4e, portal) ----------
// Batches from 4d with lines that add up to each total; the October lines are the 2e approval's
// payees. ASSUMED: how the July to September totals and the Q3 run divide between payees, bank
// digits other than Marco's and Kesi's, and Night Bus's recoupment history.
type Line = [party: string, role: string, dollars: number, status?: 'included' | 'carried' | 'paid' | 'failed', statement?: string];
const BATCHES: { slug: string; name: string; cadence: 'monthly' | 'quarterly'; period: string; pays: string; status: 'draft' | 'awaiting' | 'sent' | 'failed'; approval?: string; sent?: string; lines: Line[] }[] = [
  { slug: 'pb-2026-10', name: 'October 2026', cadence: 'monthly', period: '2026-10-01', pays: '2026-11-10', status: 'awaiting', approval: 'apr_payout_oct', lines: [
    ['marco-dela', 'Producer, 3 points', 285, 'included', 'ST-2026-10-MD'], ['ari-monroe', 'Feature, 10% of artist share', 260.75, 'included', 'ST-2026-10-AM'],
    ['dana-okafor', 'The Low Hours', 214.2], ['theo-lind', 'The Low Hours', 214.2], ['rue-sato', 'The Low Hours', 214.2], ['ines-pardo', 'Mix engineer, 1 point', 51.83],
    ['jules-arden', 'Session bass', 18.4, 'carried'], ['pia-novak', 'Artwork, 0.5 pt', 9.12, 'carried'],
  ] },
  { slug: 'pb-2026-q3', name: 'Q4 artist run', cadence: 'quarterly', period: '2026-10-01', pays: '2027-01-15', status: 'draft', lines: [
    ['kesi-vale', 'Artist, 50% of net profit', 2346.75, 'included', 'ST-2026-10-KV'], ['the-low-hours', 'Artist, 50% of net profit', 4557.4],
  ] },
  { slug: 'pb-2026-09', name: 'September 2026', cadence: 'monthly', period: '2026-09-01', pays: '2026-10-10', status: 'sent', sent: '2026-10-10', lines: [
    ['marco-dela', 'Producer, 3 points', 312.6, 'paid', 'ST-2026-09-MD'], ['ari-monroe', 'Feature, 10% of artist share', 280.12, 'paid'],
    ['dana-okafor', 'The Low Hours', 141.9, 'paid'], ['theo-lind', 'The Low Hours', 141.91, 'paid'], ['rue-sato', 'The Low Hours', 141.91, 'paid'],
  ] },
  { slug: 'pb-2026-08', name: 'August 2026', cadence: 'monthly', period: '2026-08-01', pays: '2026-09-10', status: 'failed', sent: '2026-09-10', lines: [
    ['marco-dela', 'Producer, 3 points', 290, 'paid'], ['ari-monroe', 'Feature, 10% of artist share', 250, 'paid'],
    ['dana-okafor', 'The Low Hours', 131.34, 'paid'], ['theo-lind', 'The Low Hours', 131.34, 'failed'], ['rue-sato', 'The Low Hours', 131.34, 'paid'],
  ] },
  { slug: 'pb-2026-07', name: 'July 2026', cadence: 'monthly', period: '2026-07-01', pays: '2026-08-10', status: 'sent', sent: '2026-08-10', lines: [
    ['marco-dela', 'Producer, 3 points', 258.7, 'paid'], ['ari-monroe', 'Feature, 10% of artist share', 240, 'paid'],
    ['dana-okafor', 'The Low Hours', 162, 'paid'], ['rue-sato', 'The Low Hours', 162, 'paid'],
  ] },
];
// Tax forms from 4d; everyone else on file with a W-9.
const PAYEES: { slug: string; name: string; cadence?: 'quarterly'; form: string | null; signed?: string; expires?: string; treaty?: [string, string, number]; bank: [string, string] | null; openingEarned?: number }[] = [
  { slug: 'marco-dela', name: 'Marco Dela', form: 'W-9', bank: ['4821', 'Checking'], openingEarned: 548.7 }, // Jul and Aug, before statements were on the platform
  { slug: 'ari-monroe', name: 'Ari Monroe', form: 'W-9', bank: ['3310', 'Checking'] },
  // Theo lives in the UK: a W-8BEN signed Mar 4, 2023 (valid to Dec 31, 2026) with the UK treaty's 0% on royalties.
  { slug: 'theo-lind', name: 'Theo Lind', form: 'W-8BEN', signed: '2023-03-04', expires: '2026-12-31', treaty: ['GB', 'Article 12', 0], bank: ['7702', 'Checking'] },
  { slug: 'rue-sato', name: 'Rue Sato', form: 'W-9', bank: ['1184', 'Checking'] }, // a W-9 doesn't expire
  { slug: 'jules-arden', name: 'Jules Arden', form: null, bank: null },
  { slug: 'kesi-vale', name: 'Kesi Vale', cadence: 'quarterly', form: 'W-9', bank: ['0917', 'Checking'] },
  { slug: 'the-low-hours', name: 'The Low Hours', cadence: 'quarterly', form: 'W-9', bank: ['5530', 'Business checking'] },
  { slug: 'dana-okafor', name: 'Dana Okafor', form: 'W-9', bank: ['2206', 'Checking'] },
  { slug: 'ines-pardo', name: 'Ines Pardo', form: 'W-9', bank: ['6418', 'Savings'] },
  { slug: 'pia-novak', name: 'Pia Novak', form: 'W-9', bank: ['9051', 'Checking'] },
];

async function seedPayouts(tx: Tx, tenant: string) {
  await tx`INSERT INTO payout_policies (tenant_id, minimum_cents) VALUES (${tenant}, 2500)`;
  const party: Record<string, string> = {};
  for (const p of PAYEES) {
    const [row] = await tx`INSERT INTO parties (tenant_id, slug, name) VALUES (${tenant}, ${p.slug}, ${p.name})
      ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    party[p.slug] = row.id;
    // Each W-9 payee's taxpayer number is confirmed (its last 4 digits); the full number stays with the payout provider.
    const tin = p.form === 'W-9' ? String(1000 + (PAYEES.indexOf(p) * 1373) % 9000) : null;
    await tx`INSERT INTO payees (tenant_id, party_id, cadence, tax_form, tax_signed_on, tax_expires_on, treaty_country, treaty_article, treaty_rate_bp, bank_last4, bank_name, opening_earned_cents,
                                 tin_last4, tax_country, tax_legal_name)
      VALUES (${tenant}, ${row.id}, ${p.cadence ?? 'monthly'}, ${p.form}, ${p.signed ?? null}, ${p.expires ?? null}, ${p.treaty?.[0] ?? null}, ${p.treaty?.[1] ?? null}, ${p.treaty?.[2] ?? null},
              ${p.bank?.[0] ?? null}, ${p.bank?.[1] ?? null}, ${Math.round((p.openingEarned ?? 0) * 100)},
              ${tin}, ${p.form === 'W-9' ? 'US' : p.treaty?.[0] ?? null}, ${p.form ? p.name : null})`;
  }
  for (const b of BATCHES) {
    const history = b.status === 'sent' || b.status === 'failed';
    const [row] = await tx`INSERT INTO payout_batches (tenant_id, slug, name, cadence, period, pays_on, status, approval_id, imported, sent_at)
      VALUES (${tenant}, ${b.slug}, ${b.name}, ${b.cadence}, ${b.period}, ${b.pays}, ${b.status}, ${b.approval ?? null}, ${history}, ${b.sent ?? null}) RETURNING id`;
    for (const [slug, role, dollars, status = 'included', ref] of b.lines) {
      const st = ref ? (await tx`SELECT id FROM payee_statements WHERE tenant_id = ${tenant} AND ref = ${ref}`)[0].id : null;
      await tx`INSERT INTO payout_lines (tenant_id, batch_id, party_id, statement_id, role, amount_cents, status, failure)
        VALUES (${tenant}, ${row.id}, ${party[slug]}, ${st}, ${role}, ${Math.round(dollars * 100)}, ${status}, ${status === 'failed' ? 'bank details' : null})`;
    }
  }
  // 4e. Glasshouse recouped its $4,000.00 in October (the 4c waterfall); Night Bus is still recouping.
  const RECOUP = [
    // Velvet Hours recouped its last $4,000 in October. Glasshouse isn't out yet: its costs wait for income.
    { release: 'rel_velvet', advance: 0, projected: null, costs: [['Recording', 2200, 10000], ['Mix and master', 800, 10000], ['Artwork', 400, 10000], ['Marketing', 1200, 5000]],
      entries: [['2026-10-01', 4000, 'DS-1026']] },
    { release: 'rel_glasshouse', advance: 0, projected: '2027-06-01', costs: [['Recording', 1200, 10000], ['Artwork', 400, 10000]],
      entries: [] },
    { release: 'rel_nightbus', advance: 5000, projected: '2027-08-01', costs: [['Recording', 1800, 10000], ['Mix and master', 650, 10000], ['Video', 1000, 5000], ['Tour support', 250, 10000]],
      entries: [['2025-09-01', 900, 'DS-0925'], ['2026-01-01', 850, 'DS-0126'], ['2026-06-01', 700, 'DS-0626'], ['2026-10-01', 600, 'DS-1026']] },
  ] as const;
  for (const r of RECOUP) {
    const [rel] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = ${r.release}`;
    const [a] = await tx`INSERT INTO recoupment_accounts (tenant_id, release_id, advance_cents, projected_on) VALUES (${tenant}, ${rel.id}, ${r.advance * 100}, ${r.projected}) RETURNING id`;
    for (const [category, cost, share] of r.costs) {
      await tx`INSERT INTO recoupable_costs (tenant_id, account_id, category, cost_cents, share_bp) VALUES (${tenant}, ${a.id}, ${category}, ${cost * 100}, ${share})`;
    }
    for (const [period, dollars, source] of r.entries) {
      await tx`INSERT INTO recoupment_entries (tenant_id, account_id, period, amount_cents, source) VALUES (${tenant}, ${a.id}, ${period}, ${dollars * 100}, ${source})`;
    }
  }
}

/** One payee and a draft batch for the second label, for cross-tenant checks. */
async function seedHarborPayouts(tx: Tx, tenant: string) {
  const [p] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = 'mara-quill'`;
  await tx`INSERT INTO payees (tenant_id, party_id, tax_form, bank_last4, bank_name) VALUES (${tenant}, ${p.id}, 'W-9', '4400', 'Checking')`;
  const [b] = await tx`INSERT INTO payout_batches (tenant_id, slug, name, cadence, period, pays_on, status) VALUES (${tenant}, 'hs-2026-10', 'October 2026', 'monthly', '2026-10-01', '2026-11-12', 'draft') RETURNING id`;
  const [st] = await tx`SELECT id FROM payee_statements WHERE tenant_id = ${tenant} AND ref = 'ST-2026-10-MQ'`;
  await tx`INSERT INTO payout_lines (tenant_id, batch_id, party_id, statement_id, role, amount_cents) VALUES (${tenant}, ${b.id}, ${p.id}, ${st.id}, 'Artist', 84210)`;
}

// ---------- Release runbooks (2g) ----------
// The Glasshouse runbook from 2g. "Now" is a fixed date; every later phase counts from the
// release date. Each delivery blocker in 2g is attached to the task it's about.
const BLOCKS: Record<string, string> = {
  'Split sheets signed (2 of 3)': 'Split sheets: Marco Dela hasn’t signed (2 of 3). Legal Agent is waiting on him.',
  'Masters delivered': 'Masters: the master WAV and instrumental aren’t uploaded yet. Kesi Vale owns this.',
  'Metadata complete': 'Metadata: credits can’t be finished until the producer agreement is signed.',
};

async function seedRunbooks(tx: Tx, tenant: string) {
  for (const r of Object.values(runbooks)) {
    const [rel] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = ${r.id}`;
    for (const [i, p] of r.phases.entries()) {
      const fixed = p.status === 'now';
      const [ph] = await tx`INSERT INTO runbook_phases (tenant_id, release_id, position, name, starts_on, offset_days, until)
        VALUES (${tenant}, ${rel.id}, ${i}, ${p.name}, ${fixed ? p.iso : null}, ${fixed ? null : daysBetween(r.date, p.iso)}, ${!!p.until}) RETURNING id`;
      for (const [j, t] of p.tasks.entries()) {
        await tx`INSERT INTO runbook_tasks (tenant_id, phase_id, position, title, owner, state, gate_owner, gate_waiting_on, blocks_delivery)
          VALUES (${tenant}, ${ph.id}, ${j}, ${t.title}, ${t.owner}, ${t.state}, ${t.gate?.owner ?? null}, ${t.gate?.waitingOn ?? null}, ${BLOCKS[t.title] ?? null})`;
      }
    }
    await tx`INSERT INTO release_pitches (tenant_id, release_id, text, char_limit) VALUES (${tenant}, ${rel.id}, ${r.pitch.text}, ${r.pitch.limit})`;
  }
  for (const b of budgets) {
    const [rel] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = ${b.id}`;
    for (const [i, l] of b.lines.entries()) {
      await tx`INSERT INTO release_budget_lines (tenant_id, release_id, position, category, planned_cents, spent_cents) VALUES (${tenant}, ${rel.id}, ${i}, ${l.category}, ${l.planned}, ${l.spent})`;
    }
  }
}

// ---------- Contracts (5b) ----------
// The 5b agreements. Split sheets point at their song: parties, shares and signatures are its
// writers. ASSUMED: the dates the signed agreements were signed.
const AGREEMENTS: { slug: string; template?: string; edits?: number; thirdParty?: boolean; work?: string; parties?: [slug: string, signers: number, signed: string | null][];
  key?: [string, string]; approval?: string; kind?: string; territory?: string; term?: [string, string | null]; feeBp?: number }[] = [
  { slug: 'ct_producer', template: 'producer', edits: 2, parties: [['marco-dela', 1, null]], approval: 'apr_producer' },
  { slug: 'ct_artist_kesi', template: 'artist', parties: [['kesi-vale', 1, '2026-03-06']], key: ['2029-03-06', 'Option period'] },
  { slug: 'ct_band', template: 'artist', parties: [['the-low-hours', 3, '2025-01-09']], key: ['2027-01-09', 'Audit window closes'] },
  { slug: 'ct_feature', template: 'feature', parties: [['ari-monroe', 1, '2026-09-30']] },
  { slug: 'ct_split_gh', template: 'split', work: 'glasshouse' },
  { slug: 'ct_mix_nb', template: 'producer', edits: 1, parties: [['ines-pardo', 1, '2025-04-02']], kind: 'mix' },
  { slug: 'ct_distribution', thirdParty: true, parties: [['distributor', 1, '2026-08-01']], key: ['2027-08-01', 'Renewal'] },
  // The label administers its writers' songs (publishing mode "we administer"), so it may register them.
  { slug: 'ct_admin_lh', template: 'admin', parties: [['dana-okafor', 1, '2025-01-09'], ['theo-lind', 1, '2025-01-09'], ['rue-sato', 1, '2025-01-09']],
    key: ['2027-01-09', 'Term renews'], kind: 'administration', territory: 'Worldwide', term: ['2025-01-09', null], feeBp: 1500 },
  { slug: 'ct_admin_kv', template: 'admin', parties: [['kesi-vale', 1, '2026-03-06']],
    key: ['2029-03-06', 'Term ends'], kind: 'administration', territory: 'Worldwide', term: ['2026-03-06', '2029-03-06'], feeBp: 1500 },
  { slug: 'ct_split_nb', template: 'split', work: 'night-bus' },
];

async function seedContracts(tx: Tx, tenant: string) {
  const tpl: Record<string, string> = {};
  for (const [i, t] of templates.entries()) {
    const [row] = await tx`INSERT INTO contract_templates (tenant_id, slug, name, version, updated_on, summary, clauses, playbook, label_owned, position)
      VALUES (${tenant}, ${t.id}, ${t.name}, ${t.version}, ${new Date(`${t.updated} UTC`).toISOString().slice(0, 10)}, ${t.summary}, ${tx.json(t.clauses as never)}, ${t.playbook},
              ${t.id !== 'split'}, ${i}) RETURNING id`;
    tpl[t.id] = row.id;
  }
  await tx`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${tenant}, 'distributor', 'Distributor', 'company') ON CONFLICT (tenant_id, slug) DO NOTHING`;
  for (const a of AGREEMENTS) {
    const c = contracts.find((x) => x.id === a.slug)!;
    const work = a.work ? (await tx`SELECT id FROM works WHERE tenant_id = ${tenant} AND slug = ${a.work}`)[0].id : null;
    const kind = a.kind ?? (a.thirdParty ? 'distribution' : ({ artist: 'artist', producer: 'producer', feature: 'feature', split: 'split_sheet' } as Record<string, string>)[a.template ?? ''] ?? 'other');
    const [row] = await tx`INSERT INTO agreements (tenant_id, slug, name, source, template_id, edits, reviewed, work_id, terms, key_date, key_date_what, approval_id,
                                                  kind, territory, starts_on, ends_on, admin_fee_bp)
      VALUES (${tenant}, ${a.slug}, ${c.name}, ${a.thirdParty ? 'third_party' : 'template'}, ${a.template ? tpl[a.template] : null}, ${a.edits ?? 0}, ${!!a.thirdParty},
              ${work}, ${work ? null : c.terms}, ${a.key?.[0] ?? null}, ${a.key?.[1] ?? null}, ${a.approval ?? null},
              ${kind}, ${a.territory ?? null}, ${a.term?.[0] ?? null}, ${a.term?.[1] ?? null}, ${a.feeBp ?? null}) RETURNING id`;
    for (const [i, [slug, signers, signed]] of (a.parties ?? []).entries()) {
      const [p] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = ${slug}`;
      await tx`INSERT INTO agreement_parties (tenant_id, agreement_id, party_id, signers, signed_at, position) VALUES (${tenant}, ${row.id}, ${p.id}, ${signers}, ${signed}, ${i})`;
    }
  }
}

/** The roster: who the label works with and in what role. Everything else on a card is read from other tables. */
async function seedRoster(tx: Tx, tenant: string) {
  await tx`DELETE FROM roster_members WHERE tenant_id = ${tenant}`;
  for (const [i, [slug, role, joined]] of ([['kesi-vale', 'Solo artist', '2024-03-06'], ['the-low-hours', 'Band', '2025-01-09'], ['marco-dela', 'Producer and writer', '2024-05-01']] as const).entries()) {
    const [p] = await tx`SELECT id FROM parties WHERE tenant_id = ${tenant} AND slug = ${slug}`;
    await tx`INSERT INTO roster_members (tenant_id, party_id, role, position, joined_on) VALUES (${tenant}, ${p.id}, ${role}, ${i}, ${joined})`;
  }
}

// ---------- Funding (5d, 5e) ----------
// The grant and the two offers with their real terms; cards and the comparison are worked out
// from these. ASSUMED: who made the offers (5d doesn't say).
async function seedFunding(tx: Tx, tenant: string) {
  const a = offerAssumptions;
  await tx`INSERT INTO funding_assumptions (tenant_id, annual_income_cents, growth_bp, album_annual_income_cents, years, updated_on)
    VALUES (${tenant}, ${a.annualIncome}, ${a.growthBp}, ${a.albumAnnualIncome}, ${a.years}, '2026-11-04')`;
  const [velvet] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = 'rel_velvet'`;
  const grant = funding.find((f) => f.kind === 'grant')!;
  await tx`INSERT INTO funding_opportunities (tenant_id, slug, kind, title, cash_cents, up_to, deadline, fit_bp, draft_pct, approval_id, verified_on)
    VALUES (${tenant}, ${grant.id}, 'grant', ${grant.title}, 500000, true, '2026-11-15', 8600, 80, 'apr_grant', '2026-11-03')`;
  await tx`INSERT INTO funding_opportunities (tenant_id, slug, kind, cash_cents, repay_total_cents, share_bp, offerer, received_on, deadline, buy_back, fit_bp, verified_on)
    VALUES (${tenant}, 'fund_advance', 'advance', ${advanceOffer.cash}, ${advanceOffer.repayTotal}, ${advanceOffer.shareBp}, 'Streamline Advances', '2026-11-02', '2026-12-01',
            ${offerTerms.advance.buyBack}, 7100, '2026-11-02')`;
  await tx`INSERT INTO funding_opportunities (tenant_id, slug, kind, cash_cents, share_bp, album_release_id, offerer, received_on, deadline, fit_bp, verified_on)
    VALUES (${tenant}, 'fund_sale', 'sale', ${saleOffer.cash}, ${saleOffer.shareBp}, ${velvet.id}, 'Catalog Partners', '2026-11-04', '2026-11-30', 3800, '2026-11-04')`;
}

// ---------- Departments, team and activity (5f, 5g) ----------
// The 5f departments, the 5g history, and the team: Jana and Priya Shah, the Rights lead (5h).
async function seedActivity(tx: Tx, tenant: string) {
  await tx`DELETE FROM departments WHERE tenant_id = ${tenant}`;
  await tx`DELETE FROM agent_events WHERE tenant_id = ${tenant}`;
  for (const [i, d] of departments.entries()) {
    await tx`INSERT INTO departments (tenant_id, slug, name, agent, phase, autonomy, can_act, act_note, spend_cap_cents, state, tasks_this_week, position)
      VALUES (${tenant}, ${d.id}, ${d.name}, ${d.phase === 2 ? null : d.agent}, ${d.phase}, ${d.autonomy}, ${d.canAct}, ${d.actNote}, ${d.spendCap}, ${d.state}, ${d.tasks}, ${i})`;
  }
  for (const e of activity) {
    const at = new Date(`${e.when.replace(/, (\d+:\d+)$/, ', 2026 $1')} UTC`);
    await tx`INSERT INTO agent_events (tenant_id, id, occurred_at, kind, text, who, dept, inputs, reasoning, output)
      VALUES (${tenant}, ${e.id}, ${at}, ${e.kind}, ${e.text}, ${e.who}, ${e.dept}, ${e.inputs}, ${e.reasoning}, ${e.output})`;
  }
  // The Audit Agent's flag (RUN-88119). While open, Night Bus's income would stay out of payouts (ROY-07).
  await tx`DELETE FROM audit_flags WHERE tenant_id = ${tenant}`;
  // Resolved: the distributor's stream report showed a playlist add, so the income is paid as normal.
  await tx`INSERT INTO audit_flags (tenant_id, recording_id, kind, note, event_id, resolved_at, resolution)
    SELECT ${tenant}, id, 'stream_spike', 'unusual stream spike on Oct 28', 'RUN-88119', '2026-11-08T16:00:00Z', 'Distributor report: a playlist add, real listeners'
    FROM recordings WHERE tenant_id = ${tenant} AND slug = 'night-bus'`;
  // Team members: the user row and membership the allowlist would create, with a name and title.
  for (const [email, name, role, title] of [['jana@northline.example', 'Jana', 'owner', 'Owner'], ['priya@northline.example', 'Priya Shah', 'team', 'Rights lead']] as const) {
    const [u] = await tx`INSERT INTO users (email, name) VALUES (${email}, ${name}) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    await tx`INSERT INTO allowlist (email, tenant_id, role) VALUES (${email}, ${tenant}, ${role}) ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role`;
    await tx`INSERT INTO memberships (user_id, tenant_id, role, title) VALUES (${u.id}, ${tenant}, ${role}, ${title})
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role, title = EXCLUDED.title`;
  }
}

// ---------- Settings and white label (5h, 5i) ----------
// When each integration's real connection arrives (it needs the partner's account).
const ARRIVES: Record<string, string> = {
  distributor: 'Stage 1', pro: 'Stage 1', soundexchange: 'Stage 1', payouts: 'Stage 3 (Trolley)', esign: 'Stage 2 (Dropbox Sign)', accounting: 'a later stage',
};
const CAPS: Record<string, number | null> = { money: 0, signature: null, filing: null, public: null, plan: 25000 };

async function seedSettings(tx: Tx, northline: string, harbor: string, licensee: string) {
  for (const t of [northline, harbor, licensee]) {
    for (const table of ['label_settings', 'approval_routes', 'integrations', 'white_label']) await tx.unsafe(`DELETE FROM ${table} WHERE tenant_id = $1`, [t]);
  }
  const c = labelConfig;
  // Set up before, at Draft and wait; Metadata and others were changed by hand since (kept on a re-run).
  await tx`INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents, default_autonomy, publishing_mode)
    VALUES (${northline}, ${c.country}, ${c.profile}, ${c.statementPeriod}, ${c.spendCap}, 'draft_and_wait', 'we_administer')`;
  await tx`INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents) VALUES (${harbor}, 'US', 'Small label', 'Quarterly', 20000)`;
  for (const [i, r] of routing.entries()) {
    await tx`INSERT INTO approval_routes (tenant_id, type, label, rule, approver, cap_cents, position) VALUES (${northline}, ${r.type}, ${r.label}, ${r.rule}, ${r.who}, ${CAPS[r.type]}, ${i})`;
  }
  for (const [i, x] of integrations.entries()) {
    await tx`INSERT INTO integrations (tenant_id, slug, name, abbr, state, status, arrives_with, position) VALUES (${northline}, ${x.id}, ${x.name}, ${x.abbr}, ${x.state}, ${x.status}, ${ARRIVES[x.id] ?? null}, ${i})`;
  }
  await tx`INSERT INTO white_label (tenant_id, domain, email, dns_status, theme) VALUES (${licensee}, ${tenant.domain}, ${tenant.email}, ${tenant.dns}, ${tx.json(harborTheme)})`;
  // Harbor Sound's own roster, so the licensee's sub-label list counts real artists.
  await tx`DELETE FROM roster_members WHERE tenant_id = ${harbor}`;
  const [mara] = await tx`SELECT id FROM parties WHERE tenant_id = ${harbor} AND slug = 'mara-quill'`;
  await tx`INSERT INTO roster_members (tenant_id, party_id, role) VALUES (${harbor}, ${mara.id}, 'Solo artist')`;
}

main().catch((e) => { console.error(e); process.exit(1); });
