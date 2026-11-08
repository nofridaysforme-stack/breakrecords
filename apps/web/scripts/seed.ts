// Loads the Northline sample world into a database for local development, previews and
// staging. Never production: it refuses unless BR_ALLOW_SEED=1, and it only ever writes the
// sample tenants. Run with the owner connection: SEED_DATABASE_URL=... pnpm db:seed
import { connect } from '@breakrecords/db/client';
import { approvals as items } from '../src/data/sample';
import { approvalDetails } from '../src/data/fixtures';
import { glasshouseDeal, statements as payeeStatements } from '../src/data/money';
import { catalogAssets, catalogReleases, profileClaims, recordings, regColumns, registrations, songs, unclaimed } from '../src/data/ops';
import { aiUseFromLabel } from '@breakrecords/core/metadata';
import { checkStatement } from '@breakrecords/core/statements';
import type { Tx } from '@breakrecords/db/client';

const url = process.env.SEED_DATABASE_URL;
if (!url || process.env.BR_ALLOW_SEED !== '1') {
  console.error('Set SEED_DATABASE_URL (owner role) and BR_ALLOW_SEED=1. Never run this against production.');
  process.exit(1);
}

// Who can sign in to the sample world. E2E addresses receive links in the test mailbox.
const PEOPLE = (process.env.SEED_EMAILS ?? 'jana@northline.example:northline:owner,e2e-owner@northline.example:northline:owner,e2e-harbor@harbor.example:harbor-sound:owner,e2e-payee@northline.example:northline:payee:marco-dela')
  .split(',').map((s) => { const [email, tenant, role, party] = s.split(':'); return { email: email.toLowerCase(), tenant, role, party: party ?? null }; });

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
      await tx`INSERT INTO allowlist (email, tenant_id, role, party_slug) VALUES (${p.email}, ${ids[p.tenant]}, ${p.role}, ${p.party})
        ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role, party_slug = EXCLUDED.party_slug`;
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
    // Statements point at parties, recordings and split versions, so they go first.
    for (const t of [ids.northline, ids['harbor-sound']]) {
      await tx`DELETE FROM payee_statements WHERE tenant_id = ${t}`;
      await tx`DELETE FROM income_statements WHERE tenant_id = ${t}`;
    }
    await seedCatalog(tx, ids.northline);
    await seedRights(tx, ids.northline);
    await seedSplits(tx, ids.northline);
    await seedHarborCatalog(tx, ids['harbor-sound']);
    await seedStatements(tx, ids.northline);
    await seedHarborStatements(tx, ids['harbor-sound']);
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
    { subject: ['rec', 'glasshouse'], lines: 724, cents: 1000000, units: 'streams' },
    { subject: ['rec', 'velvet-hours'], lines: 120, cents: 38000, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 90, cents: 25000, units: 'streams' },
    { subject: ['rec', 'night-bus'], lines: 160, cents: 109928, units: 'streams' },
    { subject: ['rec', 'low-light'], lines: 40, cents: 15000, units: 'streams' },
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
    { subject: ['work', 'velvet-hours'], lines: 4, cents: 7000 }, { subject: ['work', 'low-light'], lines: 3, cents: 6140 },
    { subject: ['work', 'night-bus'], lines: 6, cents: 48690 },
  ] },
  { ref: 'PRO-1026', source: 'pro', period: '2026-10-01', received: '2026-11-05', buckets: [
    { subject: ['work', 'night-bus'], lines: 3, cents: 30000 }, { subject: ['work', 'static-hymn'], lines: 2, cents: 10210 },
  ] },
  { ref: 'SYNC-1026', source: 'sync', period: '2026-10-01', received: '2026-10-21', buckets: [{ subject: ['rec', 'night-bus'], lines: 1, cents: 20000 }] },
  { ref: 'BC-1026', source: 'bandcamp', period: '2026-10-01', received: '2026-11-01', buckets: [{ subject: ['rec', 'night-bus'], lines: 3, cents: 4140, units: 'sales' }] },
  { ref: 'DS-0926', source: 'distributor', period: '2026-09-01', received: '2026-10-03', buckets: [
    { subject: ['rec', 'glasshouse'], lines: 300, cents: 1096842, units: 'streams' },
    { subject: ['rec', 'velvet-hours'], lines: 40, cents: 30000, units: 'streams' },
    { subject: ['rec', 'paper-moons'], lines: 30, cents: 20000, units: 'streams' },
    { subject: ['rec', 'night-bus'], lines: 60, cents: 50000, units: 'streams' },
    { subject: ['rec', 'low-light'], lines: 10, cents: 13870, units: 'streams' },
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
  'ST-2026-09-MD': { on: '2026-10-10', run: null, party: 'marco-dela', period: '2026-09-01' },
};

/** Northline's income for September and October, and the three payee statements issued from it. */
async function seedStatements(tx: Tx, tenant: string) {
  for (const st of INCOME) await insertIncome(tx, tenant, st);
  const [rel] = await tx`SELECT id FROM releases WHERE tenant_id = ${tenant} AND slug = 'rel_glasshouse'`;
  const [ver] = await tx`SELECT v.id FROM split_versions v JOIN split_nodes n ON n.id = v.node_id WHERE n.tenant_id = ${tenant} AND n.slug = 'gh-rec' AND v.version = 4`;
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

main().catch((e) => { console.error(e); process.exit(1); });
