// Mock data source until the /api layer lands (Phase C). Converts the design's
// sample-data.json into typed, integer-cent values at this one boundary.
// Fields marked _assumed in the JSON are invented values; keep them flagged here
// so a real data source replaces them.
import sample from '@design/sample-data.json';
import type { ApprovalSummary } from '@/components/ui/Approval';
import type { Risk } from '@/components/ui/Status';
import type { SplitParty } from '@/components/ui/Splits';
import { toCents, type Cents } from '@breakrecords/core/money';
import { pctToBp } from '@breakrecords/core/percent';
import { runWaterfall, type WaterfallRow, type WaterfallStep } from '@breakrecords/core/waterfall';

export const label = sample.label;
export const user = sample.user;

/** "2026-11-10" -> "Nov 10" (UTC, so the date never shifts by time zone). */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const RISK: Record<string, Risk> = { low: 'low', needs_your_eyes: 'needsEyes', due_soon: 'dueSoon', blocked: 'blocked' };

// Row context and risk wording from frame 2d (not in sample-data.json).
const CONTEXT: Record<string, { context: string; riskLabel?: string }> = {
  apr_payout_oct: { context: 'October statements' },
  apr_producer: { context: 'Glasshouse' },
  apr_mlc: { context: 'Velvet Hours and 2 Night Bus songs' },
  apr_grant: { context: 'Project grant, non-repayable', riskLabel: 'Due in 9 days' },
};

/** Who and what each approval touches, for the inbox filters (2d). */
export const approvalTags: Record<string, { artists: string[]; releases: string[]; dept: string; short?: string }> = {
  apr_payout_oct: { artists: ['Kesi Vale', 'The Low Hours'], releases: ['Glasshouse', 'Night Bus EP'], dept: 'Royalties' },
  apr_producer: { artists: ['Kesi Vale'], releases: ['Glasshouse'], dept: 'Legal' },
  apr_mlc: { artists: ['Kesi Vale', 'The Low Hours'], releases: ['Velvet Hours', 'Night Bus EP'], dept: 'Publishing' },
  apr_grant: { artists: ['Kesi Vale'], releases: ['Glasshouse'], dept: 'Funding', short: 'Grant draft' },
};

// A grant application is submitted to a funder, so it is a Filing (Filing routing), not a Plan.
const TYPE: Record<string, ApprovalSummary['type']> = { apr_grant: 'filing' };

export const approvals: ApprovalSummary[] = sample.approvals.map((a) => ({
  id: a.id,
  type: TYPE[a.id] ?? (a.type as ApprovalSummary['type']),
  title: a.title,
  agent: a.agent,
  due: shortDate(a.due),
  impact: a.impact,
  risk: RISK[a.risk] ?? 'low',
  ...CONTEXT[a.id],
}));
export const pendingApprovalCount = approvals.length;

// ---------- Splits (4a) ----------
const COLOR: Record<string, SplitParty['color']> = { 'Marco Dela': 1, 'Northline Records': 2, 'Kesi Vale': 3, 'Ari Monroe': 4 };
const SHORT: Record<string, string> = { 'Marco Dela': 'Producer', 'Northline Records': 'Label', 'Kesi Vale': 'Kesi', 'Ari Monroe': 'Ari' };
// Signature dates and plain-language rules from frame 4a.
const SIGNED_V4: Record<string, string> = { 'Marco Dela': 'Sep 28', 'Northline Records': 'Sep 26', 'Kesi Vale': 'Sep 27', 'Ari Monroe': 'Sep 30' };
const RULE: Record<string, string> = {
  'Marco Dela': 'Producer, 3 points off the top', 'Northline Records': '50% of net profit',
  'Kesi Vale': '50% of net profit, less feature', 'Ari Monroe': 'Feature, 10% of artist share',
};

const toParties = (shares: { party: string; pctOfTotal: number }[], signed: Record<string, string> | null): SplitParty[] =>
  shares.filter((s) => s.party !== 'unassigned').map((s) => ({
    party: s.party, short: SHORT[s.party], bp: pctToBp(s.pctOfTotal), rule: RULE[s.party],
    signed: signed ? signed[s.party] ?? null : null, color: COLOR[s.party] ?? 2,
  }));

export const splitV4 = toParties(sample.splitVersions[0].shares, SIGNED_V4);
/** Draft v5 does not total 100%; the gap is computed, never stored. */
export const splitV5 = toParties(sample.splitVersions[1].shares, null);

// ---------- Waterfall (4c) ----------
export const glasshouseWaterfall: WaterfallRow[] = runWaterfall(
  sample.waterfallGlasshouseOct2026.map((r, i): WaterfallStep =>
    'subtotal' in r && r.subtotal
      ? { kind: 'subtotal', label: r.label }
      // The design's October waterfall is Glasshouse's, but Glasshouse isn't out until Mar 5, 2027:
      // the same October income is Velvet Hours's, under its own split (v1) and costs (RC-VH).
      : { kind: i === 0 ? 'start' : 'step', label: r.label, rule: r.rule ?? '', amount: toCents(r.amount ?? 0),
          source: r.source === 'SPL-v4' ? 'SPL-VH-v1' : r.source === 'RC-GH' ? 'RC-VH' : r.source },
  ),
);
export const artistNet: Cents = toCents(sample.artistNet);

// ---------- Payout batch (2e) ----------
export const payoutBatch = {
  total: toCents(sample.payoutBatchOct.total),
  payDate: shortDate(sample.payoutBatchOct.payDate),
  payees: sample.payoutBatchOct.payees.map((p) => ({ ...p, net: toCents(p.net) })),
  carryForward: sample.payoutBatchOct.carryForward.map((c) => ({ ...c, amount: toCents(c.amount) })),
};

export const goals = sample.goals;
export const agentFeed = sample.agentFeed;
