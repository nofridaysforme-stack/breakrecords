// Batch 1 fixtures. Values come from design/sample-data.json (converted to cents
// by ./sample) and from each frame's own data in design_files, cited per block.
// Anything not in either source is marked ASSUMED so a real source replaces it.
import { formatMoney, toCents } from '@/lib/money';
import { runWaterfall } from '@/lib/waterfall';
import { approvals, glasshouseWaterfall, payoutBatch } from './sample';
import type { ApprovalDetail, HomeData, Release } from './types';

/** The mockups are set on Friday, November 6, 2026. */
export const TODAY = { iso: '2026-11-06', label: 'Fri, Nov 6' };

// ---------- Home (2c) ----------
export const home: HomeData = {
  today: TODAY.label,
  user: { name: 'Jana', initial: 'J' },
  brief:
    'Glasshouse is on track for March 6 and on budget. I drafted the producer agreement for Marco Dela; two terms need your eyes. Funding Scout found two new grants, and the state arts council application closes in 9 days.',
  numbers: [], // built in ./api because they hold React nodes
  goals: [
    { id: 'goal_glasshouse', title: 'Glasshouse single', pct: 62, meta: 'Kesi Vale · Mar 6 · $1,860 of $3,000 · on budget', href: '/releases/rel_glasshouse' },
    { id: 'goal_mlc', title: 'Register catalog with MLC', pct: 58, meta: '7 of 12 songs · 3 waiting on you' }, // _assumed in sample data
    { id: 'goal_ep', title: 'The Low Hours EP plan', pct: 18, meta: 'Draft plan · May target · not yet approved' }, // _assumed
  ],
  dates: [
    { date: 'Nov 15', title: 'Arts council grant due', meta: 'Funding Scout has a draft' },
    { date: 'Jan 9', title: 'Glasshouse masters due', meta: 'Hard gate for delivery' },
    { date: 'Feb 6', title: 'Delivery to distributor', meta: '4 weeks before release' },
    // The mockup says "Friday", but 2027-03-06 is a Saturday. Open question for the product owner.
    { date: 'Mar 6', title: 'Glasshouse release', meta: 'Kesi Vale · Saturday' },
  ],
  feed: [
    { agent: 'Release Agent', state: 'working', text: 'Building the Glasshouse pitch draft.', when: 'now' },
    { agent: 'Metadata Agent', state: 'done', text: 'Completed credits for 4 tracks.', when: '9:12' },
    { agent: 'Audit Agent', state: 'waitingOnYou', text: 'Flagged an unusual stream spike on "Night Bus" (The Low Hours).', when: '8:40' },
    { agent: 'Funding Scout', state: 'done', text: 'Found 2 new grants.', when: '7:55' },
    { agent: 'Royalties Agent', state: 'idle', text: 'Matched 1,204 of 1,231 statement lines.', when: 'Thu' },
  ],
};

export const homeNumbers = {
  income: toCents(10000), owed: payoutBatch.total, recouped: toCents(4000),
  cash90: toCents(7850), // cash90Days_assumed
  unclaimed: toCents(312.4), // unclaimedFound_assumed
};

// ---------- Approval details (2e, 2f; filing and application bodies are undrawn) ----------
const byId = Object.fromEntries(approvals.map((a) => [a.id, a]));

// Payee sources and tax status from frame 2e.
const PAYEE_SOURCE: Record<string, [string, string, 'ok' | 'expiring']> = {
  'Marco Dela': ['Glasshouse · Distributor Oct', 'W-9 on file', 'ok'],
  'Ari Monroe': ['Glasshouse · Distributor Oct', 'W-9 on file', 'ok'],
  'Dana Okafor': ['Night Bus · Distributor Oct', 'W-9 on file', 'ok'],
  'Theo Lind': ['Night Bus · Distributor Oct', 'W-8BEN on file', 'ok'],
  'Rue Sato': ['Night Bus · Distributor Oct', 'Expires Dec 1', 'expiring'],
  'Ines Pardo': ['Night Bus · SoundExchange Q3', 'W-9 on file', 'ok'],
};

// How Marco Dela's 3 points were worked out (2e link). Same statement as 4c.
const marcoRows = runWaterfall([
  { kind: 'start', label: 'Gross income', rule: 'Distributor, all stores', amount: toCents(10000), source: 'DS-1026' },
  { kind: 'step', label: 'Distributor fee', rule: '0% on this plan', amount: 0, source: 'DS-1026' },
  { kind: 'step', label: 'Platform fee', rule: '5% of gross', amount: toCents(-500), source: 'DS-1026' },
  { kind: 'subtotal', label: 'Producer royalty base' },
  { kind: 'step', label: 'Everything except 3 points', rule: '97% stays in the waterfall', amount: toCents(-9215), source: 'SPL-v4' },
]);

export const approvalDetails: Record<string, ApprovalDetail> = {
  apr_payout_oct: {
    ...byId.apr_payout_oct,
    breadcrumb: 'Money',
    outcome: { text: `If you approve, ${formatMoney(payoutBatch.total)} goes to 6 payees on ${payoutBatch.payDate} from October statements.`, highlight: formatMoney(payoutBatch.total) },
    primaryLabel: `Approve and send ${formatMoney(payoutBatch.total)}`,
    rejectLabel: 'Reject with reason',
    evidence: {
      whyLabel: 'Why this batch',
      why: 'I applied the signed split versions to October income, carried forward anyone under the $25 minimum and checked every payee has a valid tax form. Two payees were carried forward and are not in this batch.',
      inputs: [
        { label: 'Distributor statement, Oct', ref: 'DS-1026', href: '/money/royalties' },
        { label: 'SoundExchange, Q3', ref: 'SX-Q3-26', href: '/money/royalties' },
        { label: 'Glasshouse splits', ref: 'v4 signed', href: '/splits/gh-rec' },
        { label: 'Night Bus splits', ref: 'v2 signed', href: '/splits/nb-rec' },
      ],
      steps: ['Imported 1,231 statement lines', 'Matched 1,204 lines to recordings', 'Applied split versions in effect Oct 1 to 31', 'Checked tax forms for 8 payees'],
      auditId: 'AUD-7F3K-2291',
    },
    body: {
      kind: 'payout',
      stats: [
        { label: 'Payees', value: String(payoutBatch.payees.length) },
        { label: 'Withheld', value: formatMoney(0) },
        { label: 'Carried forward', value: `${payoutBatch.carryForward.length} under $25` },
        { label: 'Pays out', value: payoutBatch.payDate },
      ],
      payees: payoutBatch.payees.map((p) => {
        const [source, taxForm, taxState] = PAYEE_SOURCE[p.name];
        return { name: p.name, role: p.role, source, taxForm, taxState, withheld: 0, net: p.net };
      }),
      total: payoutBatch.total,
      waterfall: { payee: 'Marco Dela', amount: toCents(285), rows: marcoRows, totalLabel: 'Marco Dela earns' },
    },
  },

  apr_producer: {
    ...byId.apr_producer,
    breadcrumb: 'Signature',
    outcome: { text: 'If you approve, I send Marco Dela the producer agreement for Glasshouse to sign.' },
    primaryLabel: 'Approve and send for signature',
    rejectLabel: 'Reject',
    evidence: {
      whyLabel: 'Why this agreement',
      why: 'Glasshouse needs a signed producer agreement before metadata can be finished. I drafted it from your producer template v3 and compared Marco’s manager’s two edits to your playbook.',
      inputs: [
        { label: 'Producer template', ref: 'v3', href: '/contracts' },
        { label: 'Deal playbook', ref: 'PB-2026', href: '/contracts' }, // ASSUMED ref
        { label: 'Manager redline, Nov 4', ref: 'RL-1104', href: '/contracts' }, // ASSUMED ref
        { label: 'Glasshouse splits', ref: 'v4 signed', href: '/splits/gh-rec' },
      ],
      steps: ['Drafted from Northline producer v3', 'Compared 2 edits to your playbook', 'Checked points against split v4', 'Wrote the plain-words summary'],
      auditId: 'AUD-7F3K-2296', // ASSUMED
    },
    body: {
      kind: 'contract',
      plain: [
        ['Marco gets', '3 points (3% of recording income), paid after costs are recouped'],
        ['Advance', '$1,500 against his royalties'],
        ['Credit', '"Produced by Marco Dela" on all platforms'],
        ['Who owns the master', 'Northline Records'],
        ['Template', 'Northline producer v3 · 2 edits from Marco’s manager'],
      ],
      flags: [
        { id: 'f42', title: 'The $1,500 advance is non-recoupable', ref: '§4.2', draft: 'Advance of $1,500 shall be non-recoupable.', playbook: 'Advance recoupable from producer royalties only.', why: 'Marco keeps the $1,500 and starts earning points right away, so Glasshouse pays out about $1,500 more before you break even. Producer advances are usually recoupable from their own royalties.' },
        { id: 'f52', title: 'Marco must approve any remix', ref: '§5.2', draft: 'No remix released without Producer’s prior written approval.', playbook: 'Producer is credited on remixes; no approval right.', why: 'An approval right can slow or block remix deals and sync edits. A consultation right is a common middle ground.' },
      ],
      labelHeadNote: 'I drafted this from your template. The manager’s two edits are common in producer deals, but I can’t tell you they’re right for you. Attorney review is optional here.',
      offTemplate: false,
      document: {
        page: 'page 2 of 9',
        blocks: [
          { kind: 'heading', text: '4. Royalties' },
          { kind: 'clause', text: '4.1 Producer shall receive a royalty of three percent (3%) of net receipts from exploitation of the Master, payable following recoupment of recording costs at the Artist’s net rate.' },
          { kind: 'clause', text: '4.2 The Advance of One Thousand Five Hundred Dollars ($1,500) shall be non-recoupable.', flagRef: 'f42' },
          { kind: 'heading', text: '5. Credit and approvals' },
          { kind: 'clause', text: '5.1 Producer shall be credited as "Produced by Marco Dela" in all metadata.' },
          { kind: 'clause', text: '5.2 No remix of the Master shall be released without Producer’s prior written approval.', flagRef: 'f52' },
        ],
        footer: 'Version 3 · edited Nov 4',
      },
    },
  },

  apr_mlc: {
    ...byId.apr_mlc,
    breadcrumb: 'Filing',
    outcome: { text: 'If you approve, I register 3 songs with the MLC so their US streaming mechanicals get paid.' },
    primaryLabel: 'Approve and file',
    rejectLabel: 'Reject with reason',
    evidence: {
      whyLabel: 'Why this filing',
      why: 'Glasshouse needs an MLC registration before release so first-week streams pay the writers. Two catalog songs were never registered, which is likely why their mechanicals are missing. I haven’t confirmed that with the MLC yet.',
      inputs: [
        { label: 'Glasshouse split sheet', ref: 'v4 signed', href: '/splits/gh-rec' },
        { label: 'Catalog songs', ref: '3 works', href: '/catalog/songs' },
        { label: 'MLC search', ref: 'no matches', href: '/rights/registrations' },
      ],
      steps: ['Searched the MLC for existing works', 'Built the bulk registration file', 'Linked recordings by ISRC', 'Listed facts only you can confirm'],
      auditId: 'AUD-7F3K-2299', // ASSUMED
    },
    body: {
      kind: 'filing',
      org: 'MLC',
      // Frame 5c: the 3 MLC filings that need you are Glasshouse, Night Bus and Static Hymn (ISRCs from 5a).
      // ASSUMED: The Low Hours' writer shares.
      works: [
        { title: 'Glasshouse', writers: 'Kesi Vale 75%, Marco Dela 25%', isrc: 'USNL12600014', iswc: 'Assigned after filing' }, // 25% per frame 4f
        { title: 'Night Bus', writers: 'Dana Okafor 34%, Theo Lind 33%, Rue Sato 33%', isrc: 'USNL12500031', iswc: 'Assigned after filing' },
        { title: 'Static Hymn', writers: 'Dana Okafor 34%, Theo Lind 33%, Rue Sato 33%', isrc: 'USNL12500032', iswc: 'Assigned after filing' },
      ],
      facts: [
        'The lyrics and melodies of all 3 songs were written by the people listed.',
        'The writer shares match the signed split sheets.',
        'Northline has the right to register these songs for the writers listed.',
      ],
    },
  },

  apr_grant: {
    ...byId.apr_grant,
    breadcrumb: 'Plan',
    outcome: { text: 'If you approve, I submit the arts council application asking for up to $5,000 for Glasshouse.' },
    primaryLabel: 'Approve and submit',
    rejectLabel: 'Reject with reason',
    evidence: {
      whyLabel: 'Why this grant',
      why: 'The state arts council project grant fits Glasshouse: a local artist, a dated release and a public show. It is non-repayable and costs nothing to apply.',
      inputs: [
        { label: 'Program page', ref: 'verified Oct 28', href: '/funding' },
        { label: 'Glasshouse budget', ref: '$3,000', href: '/releases/rel_glasshouse' },
        { label: 'Kesi Vale bio', ref: 'catalog', href: '/catalog/recordings' },
      ],
      steps: ['Checked eligibility rules', 'Drafted answers from your catalog', 'Built the budget sheet', 'Checked character limits'],
      auditId: 'AUD-7F3K-2301', // ASSUMED
    },
    body: {
      kind: 'application',
      to: 'State Arts Council, Project Grants',
      ask: 'Up to $5,000, non-repayable',
      deadline: { date: 'Nov 15', verified: 'Oct 28, 2026', href: '/funding' },
      // ASSUMED: draft copy written for the undrawn application body.
      fields: [
        { label: 'Project summary', limit: 1500, value: 'Northline Records is an independent label releasing "Glasshouse," a new single by R&B artist Kesi Vale, on March 6, 2027. The grant would pay for mastering, a live session video made with local crew, and a free all-ages release show.' },
        { label: 'Community benefit', limit: 800, value: 'The release show is free and all-ages, and the session video hires local camera and sound crew.' },
      ],
    },
  },
};

// ---------- Release runbook (2g) ----------
export const releases: Record<string, Release> = {
  rel_glasshouse: {
    id: 'rel_glasshouse', title: 'Glasshouse', kind: 'Single', artist: 'Kesi Vale', date: '2027-03-06', status: 'onTrack',
    budget: toCents(3000), spent: toCents(1860),
    phases: [
      { name: 'Now', iso: '2026-11-06', status: 'now', tasks: [
        { title: 'Producer agreement, Marco Dela', owner: 'Legal Agent', state: 'needsYou' },
        { title: 'Budget approved, $3,000', owner: 'Label Head', state: 'done' },
        { title: 'Cover art final', owner: 'Release Agent', state: 'done' },
      ] },
      { name: '8 weeks out', iso: '2027-01-09', status: 'future', tasks: [
        { title: 'Split sheets signed (2 of 3)', owner: 'Legal', state: 'locked', gate: { owner: 'Legal', waitingOn: 'Marco Dela' } },
        { title: 'Masters delivered', owner: 'Kesi Vale', state: 'waiting' },
      ] },
      { name: '6 weeks out', iso: '2027-01-23', status: 'future', tasks: [
        { title: 'Masters accepted', owner: 'Distribution Agent', state: 'locked', gate: { owner: 'Distribution Agent' } },
        { title: 'ISRC and UPC assigned', owner: 'Metadata Agent', state: 'waiting' },
      ] },
      { name: '4 weeks out', iso: '2027-02-06', status: 'future', tasks: [
        { title: 'Metadata complete', owner: 'Metadata Agent', state: 'locked', gate: { owner: 'Metadata Agent' } },
        { title: 'Deliver to distributor', owner: 'Distribution Agent', state: 'waiting' },
      ] },
      { name: '2 weeks out', iso: '2027-02-20', status: 'future', tasks: [{ title: 'Pitch submitted to playlists', owner: 'Release Agent', state: 'waiting' }] },
      { name: 'Release week', iso: '2027-03-06', status: 'future', tasks: [{ title: 'Release goes live', owner: 'Distribution Agent', state: 'waiting' }] },
      { name: 'After release', iso: '2027-06-04', until: true, status: 'future', tasks: [
        { title: 'First statement reconciled', owner: 'Royalties Agent', state: 'waiting' },
        { title: '90 day review', owner: 'Label Head', state: 'waiting' },
      ] },
    ],
    assets: [
      { name: 'Cover art', kind: '3000px', ready: true }, { name: 'Master WAV', kind: 'audio', ready: false },
      { name: 'Instrumental', kind: 'audio', ready: false }, { name: 'Lyrics', kind: 'text', ready: true },
      { name: 'Press photo', kind: 'photo', ready: true }, { name: 'Credits', kind: 'text', ready: true },
    ],
    registrations: [
      { name: 'PRO', status: 'confirmed', term: 'PRO' }, { name: 'MLC', status: 'needsYou', term: 'MLC' },
      { name: 'SoundExchange owner', status: 'confirmed', term: 'SoundExchange' }, { name: 'SoundExchange artist', status: 'prepared', term: 'SoundExchange' },
      { name: 'Copyright Office', status: 'notStarted' },
    ],
    pitch: { limit: 500, text: 'A late-night R&B single about outgrowing a small town. Warm Rhodes, sparse drums and Kesi’s close-mic vocal. For fans of slow, confessional soul.' },
    blockers: [
      'Split sheets: Marco Dela hasn’t signed (2 of 3). Legal Agent is waiting on him.',
      'Masters: the master WAV and instrumental aren’t uploaded yet. Kesi Vale owns this.',
      'Metadata: credits can’t be finished until the producer agreement is signed.',
    ],
  },
};

export const glasshouseStatement = glasshouseWaterfall;
