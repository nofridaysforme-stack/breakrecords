// Batch 2 fixtures (Money, Splits, Payee portal). Values from design/sample-data.json and the
// Batch 2 frames; integer cents. ASSUMED marks values neither source states.
import { toCents, type Cents } from '@breakrecords/core/money';
import { runWaterfall, type WaterfallRow } from '@breakrecords/core/waterfall';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { glasshouseWaterfall, payoutBatch } from './sample';
import type { z } from 'zod';
import type { PayoutsResponse } from '@breakrecords/contract';

// ---------- 4b Royalties ----------
export const royalties = {
  period: 'October 2026',
  stats: { income: toCents(14286.4), incomeNote: 'Up 18% on September', paid: payoutBatch.total, paidNote: 'Awaiting your approval', matched: 1204, lines: 1231, unclaimed: toCents(312.4), unclaimedNote: '2 sources to claim' },
  sources: [
    { name: 'Distributor', amount: toCents(11920.4) }, { name: 'SoundExchange', amount: toCents(1104.2) },
    { name: 'MLC', amount: toCents(618.3) }, { name: 'PRO', amount: toCents(402.1) },
    { name: 'Sync', amount: toCents(200) }, { name: 'Bandcamp', amount: toCents(41.4) },
  ],
  byArtist: [
    { name: 'Kesi Vale', meta: 'Glasshouse and 2 catalog singles', amount: toCents(10812.6) },
    { name: 'The Low Hours', meta: 'Night Bus EP', amount: toCents(3262.4) },
    { name: 'Marco Dela', meta: 'Producer and writer income', amount: toCents(211.4) },
  ],
  unmatched: {
    count: 27, value: toCents(41.12), note: 'Royalties Agent thinks 24 are a typo in "Night Bus" metadata.',
    // ASSUMED: how the $41.12 divides between the typo lines and the unknown ones.
    suggestions: [{ isrc: 'USNL1250031', source: 'Distributor', count: 24, value: toCents(38.4), recordingId: 'night-bus', recording: 'Night Bus', recordingIsrc: 'USNL12500031', reason: 'one digit short of Night Bus (USNL12500031)' }],
    unknown: { count: 3, value: toCents(2.72) },
  },
  zeroTracks: [{ name: 'Night Bus (demo)', streams: 412 }, { name: 'Static Hymn', streams: 688 }],
  policyVerified: { date: 'Oct 12, 2026', href: '#spotify-policy' },
};

// ---------- 4c Statements ----------
export type Statement = {
  id: string; payee: string; payeeId: string; release: string; period: string; split: string; pays: string;
  rows: WaterfallRow[]; net: Cents; auditId: string;
  /** Short lines for the payee portal (4f). */
  simple: { label: string; amount: Cents }[];
  qa?: { question: string; answer: string; basis: string }[];
};

const marcoOct = runWaterfall([
  { kind: 'start', label: 'Glasshouse income', rule: 'Distributor, all stores', amount: toCents(10000), source: 'DS-1026' },
  { kind: 'step', label: 'Platform fee', rule: '5% of gross', amount: toCents(-500), source: 'DS-1026' },
  { kind: 'subtotal', label: 'Producer royalty base' },
  { kind: 'step', label: 'Everything except your 3 points', rule: '97% stays in the waterfall', amount: toCents(-9215), source: 'SPL-v4' },
  { kind: 'step', label: 'Withholding', rule: 'W-9 on file', amount: 0, source: 'TAX-MD' },
]);

export const statements: Record<string, Statement> = {
  'ST-2026-10-KV': {
    id: 'ST-2026-10-KV', payee: 'Kesi Vale', payeeId: 'kesi-vale', release: 'Glasshouse', period: 'October 2026', split: 'split v4',
    pays: 'Jan 15 on the quarterly artist run', rows: glasshouseWaterfall, net: toCents(2346.75), auditId: 'AUD-7F3K-2302',
    simple: [
      { label: 'Glasshouse income', amount: toCents(10000) }, { label: 'Fees, producer and costs', amount: toCents(-4785) },
      { label: 'Label share', amount: toCents(-2607.5) }, { label: 'Feature, Ari Monroe', amount: toCents(-260.75) },
    ],
    qa: [
      { question: 'Why is this lower than September?', answer: 'October income was higher, but this is the month Glasshouse recouped. The last $4,000.00 of recording costs came out before the split. From November, nothing is deducted for costs, so the same income would net about $4,146.75.', basis: 'Based on statements DS-0926 and DS-1026. I’m confident in the math; the November figure is an estimate.' },
      { question: 'What are platform fees?', answer: 'The platform takes 5% of gross income before any split. On $10,000.00 that was $500.00. Your distributor charges nothing on this plan.', basis: 'From your plan terms and statement DS-1026.' },
      { question: 'Show the costs', answer: 'Glasshouse had $4,000.00 of recoupable costs: recording $2,200.00, mix and master $800.00, artwork $400.00 and half of the $1,200.00 marketing spend. All of it was recouped this month.', basis: 'From recoupment record RC-GH.' },
    ],
  },
  'ST-2026-10-MD': {
    id: 'ST-2026-10-MD', payee: 'Marco Dela', payeeId: 'marco-dela', release: 'Glasshouse', period: 'October 2026', split: 'split v4',
    pays: 'Nov 10', rows: marcoOct, net: toCents(285), auditId: 'AUD-7F3K-2291',
    simple: [
      { label: 'Glasshouse income', amount: toCents(10000) }, { label: 'Less platform fee', amount: toCents(-500) },
      { label: 'Your 3 points of $9,500.00', amount: toCents(285) }, { label: 'Tax withheld', amount: 0 },
    ],
  },
  // ASSUMED: September lines; only the $312.60 total is in frame 4g.
  'ST-2026-09-MD': {
    id: 'ST-2026-09-MD', payee: 'Marco Dela', payeeId: 'marco-dela', release: 'Glasshouse', period: 'September 2026', split: 'split v4',
    pays: 'Oct 10', net: toCents(312.6), auditId: 'AUD-7F3K-2190',
    rows: runWaterfall([
      { kind: 'start', label: 'Glasshouse income', rule: 'Distributor, all stores', amount: toCents(10968.42), source: 'DS-0926' },
      { kind: 'step', label: 'Platform fee', rule: '5% of gross', amount: toCents(-548.42), source: 'DS-0926' },
      { kind: 'subtotal', label: 'Producer royalty base' },
      { kind: 'step', label: 'Everything except your 3 points', rule: '97% stays in the waterfall', amount: toCents(-10107.4), source: 'SPL-v4' },
    ]),
    simple: [
      { label: 'Glasshouse income', amount: toCents(10968.42) }, { label: 'Less platform fee', amount: toCents(-548.42) },
      { label: 'Your 3 points of $10,420.00', amount: toCents(312.6) }, { label: 'Tax withheld', amount: 0 },
    ],
  },
};

// ---------- 4d Payouts ----------
export type BatchStatus = 'awaiting' | 'draft' | 'sent' | 'failed';
export type Payouts = z.infer<typeof PayoutsResponse>;
export const payouts: Payouts = {
  minimum: toCents(25),
  batches: [
    { id: 'pb-2026-10', name: 'October 2026', payees: 6, total: payoutBatch.total, status: 'awaiting' as BatchStatus, note: '2 carried forward', approvalId: 'apr_payout_oct' },
    { id: 'pb-2026-q3', name: 'Q3 artist run', payees: 2, total: toCents(6904.15), status: 'draft' as BatchStatus, note: 'Opens Jan 15' },
    { id: 'pb-2026-09', name: 'September 2026', payees: 5, total: toCents(1018.44), status: 'sent' as BatchStatus, note: 'Sent Oct 10' },
    { id: 'pb-2026-08', name: 'August 2026', payees: 5, total: toCents(934.02), status: 'failed' as BatchStatus, note: 'Theo Lind, bank details', failed: { payeeId: 'theo-lind', name: 'Theo Lind', reason: 'bank details' } },
    { id: 'pb-2026-07', name: 'July 2026', payees: 4, total: toCents(822.7), status: 'sent' as BatchStatus, note: 'Sent Aug 10' },
  ],
  taxForms: [
    { payeeId: 'marco-dela', name: 'Marco Dela', form: 'W-9', status: 'ok' as const, label: 'On file' },
    { payeeId: 'ari-monroe', name: 'Ari Monroe', form: 'W-9', status: 'ok' as const, label: 'On file' },
    { payeeId: 'theo-lind', name: 'Theo Lind', form: 'W-8BEN', status: 'ok' as const, label: 'On file' },
    { payeeId: 'rue-sato', name: 'Rue Sato', form: 'W-9', status: 'expiring' as const, label: 'Expires Dec 1', fix: 'Request new' },
    { payeeId: 'jules-arden', name: 'Jules Arden', form: 'None', status: 'missing' as const, label: 'Missing', fix: 'Request form' },
  ],
  carryForward: [
    { name: 'Jules Arden', role: 'Session bass', amount: payoutBatch.carryForward[0].amount },
    { name: 'Pia Novak', role: 'Artwork, 0.5 pt', amount: payoutBatch.carryForward[1].amount },
  ],
  requests: [] as { payeeId: string; kind: 'tax_form' | 'bank_details' }[],
};

// ---------- 4e Recoupment ----------
export type Recoup = {
  id: string; title: string; artist: string; advance: Cents; recouped: Cents; projected?: string; recoupedIn?: string;
  /** Full cost and the recoupable share. The amount recouped is cost × share. */
  costs: { category: string; cost: Cents; shareBp: number }[];
};
export const recoupment: Recoup[] = [
  { id: 'rel_glasshouse', title: 'Glasshouse', artist: 'Kesi Vale · label-funded single', advance: 0, recouped: toCents(4000), recoupedIn: 'Oct 2026',
    costs: [
      { category: 'Recording', cost: toCents(2200), shareBp: 10000 }, { category: 'Mix and master', cost: toCents(800), shareBp: 10000 },
      { category: 'Artwork', cost: toCents(400), shareBp: 10000 },
      { category: 'Marketing', cost: toCents(1200), shareBp: 5000 }, // ASSUMED full cost; 4e shows the $600 recoupable half
    ] },
  { id: 'rel_nightbus', title: 'Night Bus EP', artist: 'The Low Hours · $5,000 advance', advance: toCents(5000), recouped: toCents(3050), projected: 'Aug 2027',
    costs: [
      { category: 'Recording', cost: toCents(1800), shareBp: 10000 }, { category: 'Mix and master', cost: toCents(650), shareBp: 10000 },
      { category: 'Video', cost: toCents(1000), shareBp: 5000 }, // ASSUMED full cost; 4e shows the $500 recoupable half
      { category: 'Tour support', cost: toCents(250), shareBp: 10000 },
    ] },
];

// ---------- Budgets (undrawn) ----------
// ASSUMED split of the $1,860 spent; only the total is in the sample data.
export const budgets = [
  { id: 'rel_glasshouse', title: 'Glasshouse', budget: toCents(3000), lines: [
    { category: 'Mastering', planned: toCents(450), spent: toCents(450) }, { category: 'Cover art', planned: toCents(400), spent: toCents(400) },
    { category: 'Session video', planned: toCents(1200), spent: toCents(760) }, { category: 'Release show', planned: toCents(950), spent: toCents(250) },
  ] },
];

// ---------- 4a Splits ----------
export const splitTree = [{
  id: 'northline', label: 'Northline Records', children: [
    { id: 'kesi', label: 'Kesi Vale', children: [{ id: 'glasshouse', label: 'Glasshouse (single)', children: [
      { id: 'gh-rec', label: 'Recording income', override: true }, { id: 'gh-song', label: 'Song income' }, { id: 'gh-sync', label: 'Sync' },
    ] }] },
    { id: 'low-hours', label: 'The Low Hours', children: [{ id: 'night-bus', label: 'Night Bus EP', children: [{ id: 'nb-rec', label: 'Recording income' }] }] },
    { id: 'marco', label: 'Marco Dela', children: [{ id: 'marco-prod', label: 'Production credits' }] },
  ],
}];

export const glasshouseDeal = {
  breadcrumb: ['Kesi Vale', 'Glasshouse', 'Recording income'],
  v4: { terms: { producerBp: 300, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 1000 } as DealTerms, effective: 'Oct 1, 2026',
    signed: { 'Marco Dela': 'Sep 28', 'Northline Records': 'Sep 26', 'Kesi Vale': 'Sep 27', 'Ari Monroe': 'Sep 30' } as Record<string, string> },
  v5: { terms: { producerBp: 300, labelOfNetBp: 4000, artistOfNetBp: 5500, featureOfArtistBp: 1000 } as DealTerms, effective: 'Jan 1, 2027', created: 'Nov 6' },
  dealTerms: [['Type', 'Net profit, 50/50'], ['Funded by', 'Label'], ['Recoupable', 'Recording, mix, art, marketing'], ['Term', '3 years from release']] as [string, string][],
  market: { text: 'Producer points are usually 2 to 4 on an indie single. Marco’s 3 is in range. Points are taken before the net profit split, so they reduce both shares.', verified: 'Oct 28, 2026' },
  history: [{ v: 'v3', date: 'Jun 1, 2026' }, { v: 'v2', date: 'Feb 12, 2026' }],
};

// ---------- 4f to 4h Payee portal ----------
export type Payee = {
  id: string; first: string; name: string; label: string; labelShort: string;
  earned: Cents; paid: Cents; next: { amount: Cents; date: string; from: string };
  tax: { ok: boolean; label: string; form: string; expires?: string };
  bank: { last4: string; name: string } | null;
  statementIds: string[];
  splits: { title: string; meta: string; terms: string; status: 'signed' | 'waiting'; note: string; v5?: boolean }[];
  signPrompt: { title: string; text: string };
};

export const payees: Record<string, Payee> = {
  'marco-dela': {
    id: 'marco-dela', first: 'Marco', name: 'Marco Dela', label: 'Northline Records', labelShort: 'Northline',
    earned: toCents(1146.3), paid: toCents(861.3), next: { amount: toCents(285), date: 'Nov 10', from: 'From Glasshouse, October. 3 points.' },
    tax: { ok: true, label: 'W-9 on file', form: 'W-9', expires: 'No expiry' },
    bank: { last4: '4821', name: 'Checking' }, // ASSUMED
    statementIds: ['ST-2026-10-MD', 'ST-2026-09-MD'],
    splits: [
      { title: 'Glasshouse', meta: 'Kesi Vale', terms: '3 points', status: 'signed', note: 'signed v4' },
      { title: 'Glasshouse (song)', meta: 'writer', terms: '25%', status: 'signed', note: 'signed' },
      { title: 'Glasshouse', meta: 'v5 draft', terms: '', status: 'waiting', note: 'Waiting for you to sign', v5: true },
    ],
    signPrompt: { title: 'Glasshouse split v5 needs your signature', text: 'Your 3 points don\u2019t change. Kesi\u2019s share does.' },
  },
  // Frame 4h shows Kesi's statement, so Kesi has a portal too. ASSUMED: earned and paid totals.
  'kesi-vale': {
    id: 'kesi-vale', first: 'Kesi', name: 'Kesi Vale', label: 'Northline Records', labelShort: 'Northline',
    earned: toCents(2346.75), paid: 0, next: { amount: toCents(2346.75), date: 'Jan 15', from: 'From Glasshouse, October. 50% of net profit, less feature.' },
    tax: { ok: true, label: 'W-9 on file', form: 'W-9', expires: 'No expiry' },
    bank: { last4: '0917', name: 'Checking' },
    statementIds: ['ST-2026-10-KV'],
    splits: [
      { title: 'Glasshouse', meta: 'Northline Records', terms: '43.65%', status: 'signed', note: 'signed v4' },
      { title: 'Glasshouse (song)', meta: 'writer', terms: '75%', status: 'signed', note: 'signed' },
      { title: 'Glasshouse', meta: 'v5 draft', terms: '', status: 'waiting', note: 'Waiting for you to sign', v5: true },
    ],
    signPrompt: { title: 'Glasshouse split v5 needs your signature', text: 'Your share goes up from 43.65% to 48.02% of recording income.' },
  },
};
