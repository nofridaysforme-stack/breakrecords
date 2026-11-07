// Batch 3 fixtures (Catalog, Contracts, Rights, Funding, Departments, Activity, Settings,
// White label, Roster). Values from the Batch 3 frames and design/sample-data.json.
// ASSUMED marks values neither source states. Money is integer cents.
import { toCents, type Cents } from '@breakrecords/core/money';
import type { OfferAssumptions, AdvanceOffer, SaleOffer } from '@breakrecords/core/offers';
import type { ThemeColors } from '@/lib/theme';
import type { Status } from '@/components/ui/Status';
import type { AgentState } from '@/components/ui/Status';
import type { Autonomy } from '@/components/ui/AutonomyDial';

// ---------- 5a Catalog ----------
export type Credit = { name: string; role: string };
export type Recording = {
  id: string; title: string; artist: string; isrc: string | null; score: number; ai: string;
  duration: string; upc: string | null; song: string; iswc: string | null; genre: string | null;
  credits: Credit[];
  /** Completeness note after "{score}% complete." */
  note: string;
};

const lowHours: Credit[] = [
  { name: 'Dana Okafor', role: 'Vocals, guitar, writer' }, { name: 'Theo Lind', role: 'Bass, writer' },
  { name: 'Rue Sato', role: 'Drums, writer' }, { name: 'Ines Pardo', role: 'Mix engineer' },
];

export const recordings: Recording[] = [
  {
    id: 'glasshouse', title: 'Glasshouse', artist: 'Kesi Vale', isrc: 'USNL12600014', score: 92, ai: 'None', duration: '3:42',
    upc: '196922410037', song: 'Glasshouse', iswc: null, genre: 'R&B',
    credits: [
      { name: 'Kesi Vale', role: 'Artist, writer' }, { name: 'Marco Dela', role: 'Producer, writer' },
      { name: 'Ari Monroe', role: 'Featured vocal' }, { name: 'Ines Pardo', role: 'Mix engineer' }, { name: 'Jules Arden', role: 'Bass' },
    ],
    note: 'Missing the ISWC. Publishing Agent will add it once the MLC filing is confirmed.',
  },
  // ASSUMED below: durations, UPCs, ISWCs and the completeness notes. Titles, ISRCs, scores and AI use are from 5a.
  { id: 'night-bus', title: 'Night Bus', artist: 'The Low Hours', isrc: 'USNL12500031', score: 100, ai: 'None', duration: '4:05', upc: '196922410020', song: 'Night Bus', iswc: 'T-931.204.118-6', genre: 'Indie rock', credits: lowHours, note: 'Nothing missing.' },
  { id: 'static-hymn', title: 'Static Hymn', artist: 'The Low Hours', isrc: 'USNL12500032', score: 84, ai: 'None', duration: '3:18', upc: '196922410020', song: 'Static Hymn', iswc: null, genre: 'Indie rock', credits: lowHours, note: 'Missing the ISWC and the lyrics. Publishing Agent will add the ISWC after the MLC filing.' },
  { id: 'velvet-hours', title: 'Velvet Hours', artist: 'Kesi Vale', isrc: 'USNL12400007', score: 100, ai: 'None', duration: '3:56', upc: '196922410006', song: 'Velvet Hours', iswc: 'T-929.880.214-1', genre: 'R&B', credits: [{ name: 'Kesi Vale', role: 'Artist, writer' }, { name: 'Marco Dela', role: 'Producer' }], note: 'Nothing missing.' },
  { id: 'low-light', title: 'Low Light', artist: 'Marco Dela', isrc: null, score: 46, ai: 'Partial, stems', duration: '2:58', upc: null, song: 'Low Light', iswc: null, genre: null, credits: [{ name: 'Marco Dela', role: 'Producer, writer' }], note: 'Missing the ISRC, genre and most credits. Metadata Agent asked Marco Dela for the credits.' },
  { id: 'night-bus-demo', title: 'Night Bus (demo)', artist: 'The Low Hours', isrc: 'USNL12500029', score: 71, ai: 'None', duration: '3:51', upc: null, song: 'Night Bus', iswc: 'T-931.204.118-6', genre: 'Indie rock', credits: lowHours.slice(0, 3), note: 'Missing the mix credit and a release. Demos often stay off stores.' },
  { id: 'paper-moons', title: 'Paper Moons', artist: 'Kesi Vale', isrc: 'USNL12400008', score: 96, ai: 'None', duration: '3:30', upc: '196922410006', song: 'Paper Moons', iswc: 'T-929.880.215-2', genre: 'R&B', credits: [{ name: 'Kesi Vale', role: 'Artist, writer' }, { name: 'Marco Dela', role: 'Producer' }], note: 'Missing the lyrics.' },
];

/** Catalog totals from 5a. The fixtures only hold the rows drawn in the frame. */
export const catalogCounts = { songs: 18, recordings: 21, releases: 9, assets: 146 };

// ASSUMED: writer shares outside Glasshouse (75/25 per 4f).
export const songs = [
  { id: 'glasshouse', title: 'Glasshouse', writers: 'Kesi Vale 75%, Marco Dela 25%', iswc: null, recordings: 1, mlc: 'needsYou' as Status },
  { id: 'night-bus', title: 'Night Bus', writers: 'Dana Okafor 34%, Theo Lind 33%, Rue Sato 33%', iswc: 'T-931.204.118-6', recordings: 2, mlc: 'needsYou' as Status },
  { id: 'static-hymn', title: 'Static Hymn', writers: 'Dana Okafor 34%, Theo Lind 33%, Rue Sato 33%', iswc: null, recordings: 1, mlc: 'needsYou' as Status },
  { id: 'velvet-hours', title: 'Velvet Hours', writers: 'Kesi Vale 100%', iswc: 'T-929.880.214-1', recordings: 1, mlc: 'confirmed' as Status },
  { id: 'paper-moons', title: 'Paper Moons', writers: 'Kesi Vale 100%', iswc: 'T-929.880.215-2', recordings: 1, mlc: 'confirmed' as Status },
  { id: 'low-light', title: 'Low Light', writers: 'Marco Dela 100%', iswc: null, recordings: 1, mlc: 'prepared' as Status },
];

// ASSUMED: Night Bus EP and Velvet Hours dates and UPCs.
export const catalogReleases = [
  { id: 'rel_glasshouse', title: 'Glasshouse', artist: 'Kesi Vale', kind: 'Single', date: 'Mar 5, 2027', upc: '196922410037', tracks: 1, href: '/releases/rel_glasshouse' },
  { id: 'rel_nightbus', title: 'Night Bus EP', artist: 'The Low Hours', kind: 'EP', date: 'Jun 13, 2025', upc: '196922410020', tracks: 4 },
  { id: 'rel_velvet', title: 'Velvet Hours', artist: 'Kesi Vale', kind: 'Album', date: 'Sep 20, 2024', upc: '196922410006', tracks: 10 },
];

export const catalogAssets = [
  { name: 'Glasshouse cover art', kind: 'Image · 3000px', release: 'Glasshouse', ready: true },
  { name: 'Glasshouse master WAV', kind: 'Audio', release: 'Glasshouse', ready: false },
  { name: 'Glasshouse instrumental', kind: 'Audio', release: 'Glasshouse', ready: false },
  { name: 'Glasshouse lyrics', kind: 'Text', release: 'Glasshouse', ready: true },
  { name: 'Kesi Vale press photo', kind: 'Image · 2400px', release: 'Glasshouse', ready: true },
  { name: 'Night Bus EP cover art', kind: 'Image · 3000px', release: 'Night Bus EP', ready: true },
  { name: 'Low Light stems', kind: 'Audio · 8 files', release: 'Not assigned', ready: true },
  { name: 'Velvet Hours cover art', kind: 'Image · 3000px', release: 'Velvet Hours', ready: true },
];

// ---------- 5b Contracts ----------
export type SigState = 'waiting' | 'signed' | 'partial';
export type Contract = {
  id: string; name: string; template: string; templateId?: string; parties: string; terms: string;
  date: string | null; dateWhat: string; sig: string; sigState: SigState; href?: string;
};

export const contracts: Contract[] = [
  { id: 'ct_producer', name: 'Producer agreement, Glasshouse', template: 'Northline producer v3 · 2 edits', templateId: 'producer', parties: 'Marco Dela', terms: '3 points, $1,500 advance', date: 'Nov 9', dateWhat: 'Approval due', sig: 'Waiting on you', sigState: 'waiting', href: '/approvals/apr_producer' },
  { id: 'ct_artist_kesi', name: 'Artist agreement', template: 'Northline artist v2', templateId: 'artist', parties: 'Kesi Vale', terms: '50/50 net profit, 3 years', date: 'Mar 6, 2029', dateWhat: 'Option period', sig: 'Signed', sigState: 'signed' },
  { id: 'ct_band', name: 'Band agreement', template: 'Northline artist v2', templateId: 'artist', parties: 'The Low Hours (3)', terms: '50/50 net profit, $5,000 advance', date: 'Jan 9', dateWhat: 'Audit window closes', sig: 'Signed', sigState: 'signed' },
  { id: 'ct_feature', name: 'Feature agreement', template: 'Northline feature v1', templateId: 'feature', parties: 'Ari Monroe', terms: '10% of artist share', date: null, dateWhat: '', sig: 'Signed', sigState: 'signed' },
  { id: 'ct_split_gh', name: 'Split sheet, Glasshouse song', template: 'Split sheet v1', templateId: 'split', parties: 'Kesi, Marco', terms: '75 / 25', date: null, dateWhat: '', sig: '1 of 2 signed', sigState: 'partial' },
  { id: 'ct_distribution', name: 'Distribution agreement', template: 'Third party · reviewed', parties: 'Distributor', terms: '0% fee, 1 year auto-renew', date: 'Aug 1', dateWhat: 'Renewal', sig: 'Signed', sigState: 'signed' },
  // ASSUMED: the 7th active agreement the 5b subtitle counts; shares as in the MLC filing.
  { id: 'ct_split_nb', name: 'Split sheet, Night Bus song', template: 'Split sheet v1', templateId: 'split', parties: 'The Low Hours (3)', terms: '34 / 33 / 33', date: null, dateWhat: '', sig: 'Signed', sigState: 'signed' },
];

export const contractsSummary = '7 active · 1 waiting on signatures · next key date Jan 9';

export type Template = {
  id: string; name: string; version: string; summary: string;
  clauses: { title: string; text: string }[];
  playbook: string[];
  updated: string;
};

// ASSUMED: clause text and playbook lines. Names and versions are from 5b; producer terms from 2f.
export const templates: Template[] = [
  {
    id: 'artist', name: 'Artist agreement', version: 'v2 · net profit', updated: 'Mar 2, 2026',
    summary: 'For signing an artist or band to the label. Profits split after costs are recouped.',
    clauses: [
      { title: 'Profit split', text: 'Net profit splits 50/50 between the label and the artist after recoupable costs.' },
      { title: 'Term', text: '3 years, with one option period the artist can decline.' },
      { title: 'Recoupable costs', text: 'Recording and video at 100%, marketing at 50%. Nothing else is charged back.' },
      { title: 'Audit', text: 'The artist can audit statements once a year, up to 3 years back.' },
    ],
    playbook: ['Never take ownership of masters for more than the term plus 2 years.', 'Statements at least quarterly.'],
  },
  {
    id: 'producer', name: 'Producer agreement', version: 'v3 · points', updated: 'Aug 14, 2026',
    summary: 'For a producer paid in points from the first dollar, with an optional advance.',
    clauses: [
      { title: 'Royalty', text: 'Points of gross receipts, paid from the first dollar.' },
      { title: 'Advance', text: 'Recoupable against the producer royalty only.' },
      { title: 'Credit', text: '"Produced by" on every store and in the liner notes.' },
      { title: 'Delivery', text: 'Final mixes and stems by the date in the schedule.' },
    ],
    playbook: ['Points stay between 2 and 4.', 'No approval rights over the artist’s other recordings.'],
  },
  {
    id: 'feature', name: 'Feature agreement', version: 'v1', updated: 'Jan 20, 2026',
    summary: 'For a featured artist on one recording.',
    clauses: [
      { title: 'Share', text: 'A share of the main artist’s royalty, floored to the cent; the remainder stays with the artist.' },
      { title: 'Name use', text: 'The label may use the featured artist’s name and likeness to promote the recording only.' },
    ],
    playbook: ['Feature share stays at or under 15% of the artist share.'],
  },
  {
    id: 'split', name: 'Split sheet', version: 'v1 · song', updated: 'Jan 20, 2026',
    summary: 'Who wrote a song and how its publishing splits. Needed before MLC and PRO filings.',
    clauses: [
      { title: 'Writers and shares', text: 'Each writer’s share of the song. Shares must total exactly 100.00%.' },
      { title: 'Publishers', text: 'Each writer’s publisher, or “self-published”.' },
    ],
    playbook: ['Every writer signs before anything is filed.'],
  },
  {
    id: 'sync', name: 'Sync license', version: 'v1 · one-off', updated: 'May 5, 2026',
    summary: 'A one-off license to use a recording in a film, ad, game or show.',
    clauses: [
      { title: 'Use', text: 'The exact scene, length and media. Anything else needs a new license.' },
      { title: 'Fee', text: 'One fee covering the master and the song, split by the splits in place.' },
      { title: 'Territory and term', text: 'Where and for how long the use can run.' },
    ],
    playbook: ['Every sync license is a signature, so it always comes to you.'],
  },
];

// ---------- 5c Registrations ----------
export const regColumns = [
  { key: 'pro', name: 'PRO', sub: 'performance', term: 'PRO' as const },
  { key: 'mlc', name: 'MLC', sub: 'mechanical', term: 'MLC' as const },
  { key: 'sxOwner', name: 'SoundExchange', sub: 'owner', term: 'SoundExchange' as const },
  { key: 'sxArtist', name: 'SoundExchange', sub: 'artist', term: 'SoundExchange' as const },
  { key: 'copyright', name: 'Copyright', sub: 'US Office' },
  { key: 'neighboring', name: 'Neighboring', sub: 'outside US' },
];

type Cell = { status: Status; ref?: string };
const c = (status: Status, ref?: string): Cell => ({ status, ref });
export const registrations: { id: string; name: string; artist: string; cells: Cell[] }[] = [
  { id: 'glasshouse', name: 'Glasshouse', artist: 'Kesi Vale', cells: [c('confirmed', 'BMI #8821'), c('needsYou'), c('confirmed', 'SX-44120'), c('prepared'), c('notStarted'), c('notStarted')] }, // lint-allow-hex: reference numbers, not colors
  { id: 'night-bus', name: 'Night Bus', artist: 'The Low Hours', cells: [c('confirmed', 'ASCAP #1193'), c('needsYou'), c('confirmed', 'SX-40018'), c('confirmed', 'SX-40019'), c('submitted', 'SR 1-2291'), c('prepared')] }, // lint-allow-hex: reference numbers, not colors
  { id: 'static-hymn', name: 'Static Hymn', artist: 'The Low Hours', cells: [c('confirmed', 'ASCAP #1194'), c('needsYou'), c('submitted'), c('submitted'), c('notStarted'), c('notStarted')] }, // lint-allow-hex: reference numbers, not colors
  { id: 'velvet-hours', name: 'Velvet Hours', artist: 'Kesi Vale', cells: [c('confirmed', 'BMI #8204'), c('confirmed', 'MLC 77310'), c('confirmed'), c('confirmed'), c('confirmed', 'SR 1-1840'), c('submitted')] }, // lint-allow-hex: reference numbers, not colors
  { id: 'low-light', name: 'Low Light', artist: 'Marco Dela', cells: [c('prepared'), c('prepared'), c('blocked', 'needs ISRC'), c('notStarted'), c('notStarted'), c('notStarted')] },
];

// ---------- Rights > Unclaimed money (undrawn) ----------
// ASSUMED: how the $312.40 from 4b and 5c splits between the two sources.
export const unclaimed = {
  total: toCents(312.4),
  items: [
    { id: 'unc_sx', source: 'SoundExchange', what: 'Artist and owner royalties for "Night Bus", Jan to Jun 2026', amount: toCents(198.6), why: 'The recording was registered after these plays, so SoundExchange is holding them.', since: 'Jul 2026', claim: 'One claim form for the recording' },
    { id: 'unc_mlc', source: 'MLC', what: 'Mechanical royalties for the song "Night Bus", Q2 2026', amount: toCents(113.8), why: 'The song has no MLC registration yet, so the money sits unmatched.', since: 'Aug 2026', claim: 'Included in the MLC filing that needs you' },
  ] as { id: string; source: string; what: string; amount: Cents; why: string; since: string; claim: string }[],
};

// ---------- Rights > Profile claims (undrawn) ----------
// ASSUMED: every status here.
export const profileServices = ['Spotify for Artists', 'Apple Music for Artists', 'YouTube Official Artist Channel', 'Amazon Music for Artists'];
export const profileClaims: { artist: string; cells: Cell[] }[] = [
  { artist: 'Kesi Vale', cells: [c('confirmed'), c('confirmed'), c('submitted'), c('notStarted')] },
  { artist: 'The Low Hours', cells: [c('confirmed'), c('prepared'), c('notStarted'), c('notStarted')] },
  { artist: 'Marco Dela', cells: [c('needsYou', 'verify email'), c('notStarted'), c('notStarted'), c('notStarted')] },
];

// ---------- 5d Funding ----------
export type FundingItem = {
  id: string; kind: 'grant' | 'advance' | 'sale'; type: string; title: string; amount: string;
  cost: string; costTone: 'good' | 'plain' | 'critical'; deadline: string; draft: string; fit: string;
  verified: string; permanent: boolean; primary: { label: string; href: string };
};

export const funding: FundingItem[] = [
  { id: 'fund_grant', kind: 'grant', type: 'Grant · non-repayable', title: 'State arts council project grant', amount: 'Up to $5,000', cost: 'Nothing to repay', costTone: 'good', deadline: 'Nov 15 · 9 days', draft: '80% done', fit: '86%', verified: 'Nov 3, 2026', permanent: false, primary: { label: 'Open draft', href: '/approvals/apr_grant' } },
  { id: 'fund_advance', kind: 'advance', type: 'Royalty advance', title: '$8,000 for 60% of streaming until repaid', amount: '$8,000', cost: 'About $960, 14 months', costTone: 'plain', deadline: 'Offer open to Dec 1', draft: 'Compare', fit: '71%', verified: 'Nov 2, 2026', permanent: false, primary: { label: 'Compare', href: '/funding/offers/compare' } },
  { id: 'fund_sale', kind: 'sale', type: 'Partial catalog sale', title: '$15,000 for 50% of one album, forever', amount: '$15,000', cost: 'About $12,000 over 5 yrs', costTone: 'critical', deadline: 'Offer open to Nov 30', draft: 'Compare', fit: '38%', verified: 'Nov 4, 2026', permanent: true, primary: { label: 'Compare', href: '/funding/offers/compare' } },
];

export const fundingCounts = { opportunities: 3, applications: 1, offers: 2 };

export const applications = [
  { id: 'apr_grant', title: 'State arts council project grant', amount: 'Up to $5,000', status: 'Draft 80% done', due: 'Nov 15', agent: 'Funding Scout', href: '/approvals/apr_grant' },
];

// sample-data.json > offerAssumptions_assumed and funding.
export const offerAssumptions: OfferAssumptions = { annualIncome: toCents(13200), growthBp: 0, albumAnnualIncome: toCents(4800), years: 5 };
export const advanceOffer: AdvanceOffer = { kind: 'advance', cash: toCents(8000), repayTotal: toCents(8960), shareBp: 6000 };
export const saleOffer: SaleOffer = { kind: 'sale', cash: toCents(15000), shareBp: 5000, album: 'Velvet Hours' };
export const offerTerms = {
  advance: { from: 'Royalty advance', received: 'Nov 2', open: 'Dec 1', buyBack: 'Repay early, no penalty' },
  sale: { from: 'Partial catalog sale', received: 'Nov 4', open: 'Nov 30', buyBack: 'None offered' },
};

// ---------- 5f Departments ----------
export type Department = {
  id: string; name: string; agent: string; state: AgentState | 'later'; stateLabel: string;
  autonomy: Autonomy | null; tasks: number | null; spendCap: Cents | null; phase: 1 | 2;
  /** What "Act within limits" lets it do alone, or why it's off. */
  canAct: boolean; actNote: string;
};

const d = (id: string, name: string, agent: string, state: Department['state'], stateLabel: string, autonomy: Autonomy | null, tasks: number | null, cap: number | null, canAct: boolean, actNote: string, phase: 1 | 2 = 1): Department =>
  ({ id, name, agent, state, stateLabel, autonomy, tasks, spendCap: cap === null ? null : toCents(cap), phase, canAct, actNote });

// ASSUMED: spend caps other than Royalties ($50, from 5f) and every actNote except Royalties.
// The caps add up to $290, under the $300 label cap in 5h.
export const departments: Department[] = [
  d('release', 'Release', 'Release Agent', 'working', 'working', 'draft_and_wait', 12, 60, true, 'it can book routine runbook tasks and chase missing assets on its own. Spend still comes to you.'),
  d('distribution', 'Distribution', 'Distribution Agent', 'idle', 'idle', 'draft_and_wait', 2, 20, true, 'it can fix store metadata and re-deliver rejected files on its own.'),
  d('metadata', 'Metadata', 'Metadata Agent', 'done', 'done', 'act_within_limits', 8, 20, true, 'it can complete credits and fix metadata typos on its own.'),
  d('legal', 'Legal', 'Legal Agent', 'waitingOnYou', 'waiting on you', 'draft_and_wait', 3, 40, false, 'Legal work is signatures, so it always waits for you.'),
  d('royalties', 'Royalties', 'Royalties Agent', 'working', 'working', 'draft_and_wait', 9, 50, true, 'it can match statement lines and fix metadata typos on its own. Payouts still come to you.'),
  d('finance', 'Finance', 'Finance Agent', 'idle', 'idle', 'suggest', 1, 15, false, 'Finance moves money, so it always waits for you.'),
  d('publishing', 'Publishing', 'Publishing Agent', 'waitingOnYou', 'waiting on you', 'draft_and_wait', 4, 25, false, 'Publishing work is filings, so it always waits for you.'),
  d('rights', 'Rights', 'Rights Agent', 'working', 'working', 'draft_and_wait', 5, 20, false, 'Rights work is filings, so it always waits for you.'),
  d('funding', 'Funding', 'Funding Scout', 'done', 'done', 'draft_and_wait', 3, 15, true, 'it can research and dismiss poor-fit grants on its own. Applications still come to you.'),
  d('audit', 'Audit', 'Audit Agent', 'blocked', 'blocked', 'observe', 2, 15, true, 'it can open and close its own checks. It never holds money.'),
  d('artist-relations', 'Artist relations', 'Roster Agent', 'idle', 'idle', 'suggest', 1, 10, true, 'it can send routine reminders to artists, like a missing tax form.'),
  d('marketing', 'Marketing', 'Not active', 'later', 'coming later', null, null, null, false, '', 2),
  d('press', 'Press and radio', 'Not active', 'later', 'coming later', null, null, null, false, '', 2),
  d('content', 'Content studio', 'Not active', 'later', 'coming later', null, null, null, false, '', 2),
];

// ASSUMED: team members other than Jana (sample-data.json > user). "Rights lead" is named in 5h.
export const team = [
  { id: 'u_jana', name: 'Jana', role: 'Owner' },
  { id: 'u_priya', name: 'Priya Shah', role: 'Rights lead' },
];

// ---------- 5g Activity log ----------
export type ActivityKind = 'Agent run' | 'Flag' | 'Error' | 'Approval' | 'Tool call' | 'Edit';
export type ActivityEvent = {
  id: string; when: string; kind: ActivityKind; text: string; who: string; dept: string;
  inputs: string[]; reasoning: string; output: string;
};

// The flag row's inputs, reasoning and output are from 5g. ASSUMED: the others' details and every dept.
export const activity: ActivityEvent[] = [
  { id: 'RUN-88123', when: 'Nov 6, 9:12', kind: 'Agent run', text: 'Completed credits for 4 tracks', who: 'Metadata Agent', dept: 'Metadata',
    inputs: ['credits_requests.csv', 'split sheets v1', 'producer_v3 draft'], reasoning: 'Matched each credit to a signed split sheet or a draft agreement. Glasshouse credits stay provisional until the producer agreement is signed.', output: 'Credits filled for 4 tracks. Glasshouse marked provisional.' },
  { id: 'RUN-88119', when: 'Nov 6, 8:40', kind: 'Flag', text: 'Unusual stream spike on "Night Bus"', who: 'Audit Agent', dept: 'Audit',
    inputs: ['night_bus_streams_oct.csv', 'baseline: 30-day median', 'threshold: 4× median'], reasoning: 'Streams jumped from about 1,100 to 6,840 a day on Oct 28, mostly from one country with very short listens. That pattern often means artificial streams. I haven’t confirmed it.', output: 'Flag raised on Home. Suggested asking the distributor for a stream report. No money held.' },
  { id: 'RUN-88110', when: 'Nov 6, 8:02', kind: 'Error', text: 'Distributor import failed, retried at 8:05', who: 'Royalties Agent', dept: 'Royalties',
    inputs: ['distributor_oct_2026.csv'], reasoning: 'The distributor’s server timed out on the first try. The retry three minutes later succeeded and every line matched the file’s totals.', output: 'Import complete on retry. No money moved.' },
  { id: 'APR-2210', when: 'Nov 5, 17:30', kind: 'Approval', text: 'Approved Glasshouse budget, $3,000', who: 'Jana', dept: 'Release',
    inputs: ['Plan: Glasshouse single', 'budget request $3,000'], reasoning: 'Approved by Jana from the plan preview.', output: 'Budget set. Release Agent created the runbook.' },
  { id: 'TC-55120', when: 'Nov 5, 16:12', kind: 'Tool call', text: 'e-signature.send(producer_v3, Marco Dela)', who: 'Legal Agent', dept: 'Legal',
    inputs: ['producer_v3.pdf', 'signer: Marco Dela'], reasoning: 'Sent for Marco’s review only. Your signature still waits on your approval of the 2 flagged terms.', output: 'Envelope created. Marco has opened it; not signed.' },
  { id: 'EDT-0912', when: 'Nov 5, 11:47', kind: 'Edit', text: 'Changed split draft v5: Kesi 50% to 55%', who: 'Jana', dept: 'Legal',
    inputs: ['split v5 draft'], reasoning: 'Manual edit in the splits editor.', output: 'v5 now totals 105.00%; it can’t be sent until it totals 100.00%.' },
  { id: 'RUN-87940', when: 'Nov 4, 9:00', kind: 'Agent run', text: 'Found 2 new grants', who: 'Funding Scout', dept: 'Funding',
    inputs: ['weekly source check: 41 sources'], reasoning: 'Kept the state arts council grant (fit 86%). The second grant needs a nonprofit sponsor, so it scored low and I dismissed it.', output: '1 opportunity added to Funding. Draft started.' },
];

// ---------- 5h Settings ----------
export const settingsNav = [
  { id: 'profile', label: 'Profile' },
  { id: 'routing', label: 'Approval routing' },
  { id: 'limits', label: 'Limits and caps' },
  { id: 'statements', label: 'Statements and payouts' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'team', label: 'Team and roles' },
  { id: 'white-label', label: 'White label' },
  { id: 'billing', label: 'Billing' },
] as const;
export type SettingsSection = (typeof settingsNav)[number]['id'];

export const routing = [
  { type: 'money' as const, label: 'Money', rule: 'Payouts, refunds, spend over cap', who: 'Jana', cap: 'Over $0' },
  { type: 'signature' as const, label: 'Signature', rule: 'Any agreement. Never bulk-approved.', who: 'Jana', cap: 'Always' },
  { type: 'filing' as const, label: 'Filing', rule: 'PRO, MLC, SoundExchange, copyright', who: 'Jana or Rights lead', cap: 'Always' },
  { type: 'public' as const, label: 'Public', rule: 'Posts, pitches, press (Phase 2)', who: 'Jana', cap: 'Always' },
  { type: 'plan' as const, label: 'Plan', rule: 'New goals and budget changes', who: 'Jana', cap: 'Over $250' },
];

// sample-data.json > label.
export const labelConfig = {
  name: 'Northline Records', country: 'US', profile: 'Small label', statementPeriod: 'Monthly, artists quarterly',
  minimumPayout: toCents(25), spendCap: toCents(300),
};

export type IntegrationState = 'ok' | 'off' | 'err';
export const integrations: { id: string; name: string; abbr: string; state: IntegrationState; status: string }[] = [
  { id: 'distributor', name: 'Distributor', abbr: 'DS', state: 'ok', status: 'Connected' },
  { id: 'pro', name: 'PRO (BMI)', abbr: 'PRO', state: 'ok', status: 'Connected' },
  { id: 'soundexchange', name: 'SoundExchange', abbr: 'SX', state: 'off', status: 'Not connected' },
  { id: 'payouts', name: 'Payouts', abbr: '$', state: 'ok', status: 'Connected' },
  { id: 'accounting', name: 'Accounting', abbr: 'ACC', state: 'err', status: 'Token expired' },
  { id: 'esign', name: 'E-signature', abbr: 'SIG', state: 'ok', status: 'Connected' },
];

// ---------- 5i White label ----------
export const harborTheme: ThemeColors = {
  background: '#0f1a1c', // lint-allow-hex: tenant data from 5i
  surface: '#13221f', // lint-allow-hex: tenant data from 5i
  brand: '#1d4a4f', // lint-allow-hex: tenant data from 5i
  primary: '#e2b33c', // lint-allow-hex: tenant data from 5i
  text: '#e8f0ef', // lint-allow-hex: tenant data from 5i
};

export const tenant = {
  name: 'Harbor Sound', domain: 'app.harborsound.co', email: 'team@harborsound.co', dns: 'Waiting for CNAME',
  subTenants: [{ name: 'Harbor Sound', artists: 4 }, { name: 'Northline Records', artists: 3 }],
};

// ---------- Roster (undrawn) ----------
// Income from 4b (October). ASSUMED: release counts beyond the 3 releases in Catalog.
export const roster = [
  { id: 'art_kesi', name: 'Kesi Vale', type: 'Solo artist', genre: 'R&B', releases: 3, contract: 'Artist agreement · Signed', income: toCents(10812.6), open: 'Glasshouse release in 17 weeks', href: '/releases/rel_glasshouse' },
  { id: 'art_lowhours', name: 'The Low Hours', type: 'Band · 3 members', genre: 'Indie rock', releases: 1, contract: 'Band agreement · Signed', income: toCents(3262.4), open: 'Rue Sato’s tax form expires Dec 1', href: '/money/payouts' },
  { id: 'art_marco', name: 'Marco Dela', type: 'Producer and writer', genre: 'R&B', releases: 0, contract: 'Producer agreement · Waiting on you', income: toCents(211.4), open: 'Producer agreement needs your eyes', href: '/approvals/apr_producer' },
];
