import 'server-only';

// Mock API: the single source the route handlers (/api/*) and server components
// read from. Replace these functions with real calls; the shapes stay the same.
import { budgets, glasshouseDeal, payees, payouts, recoupment, royalties, splitTree, statements, type Payee, type Statement } from './money';
import { DEFAULT_PAYEE } from '@/components/portal/payee';
import { approvals as allApprovals } from './sample';
import { approvalDetails, home, homeNumbers, releases, TODAY } from './fixtures';
import type { ApprovalDetail, Release, Scenario } from './types';
import type { ApprovalSummary } from '@/components/ui/Approval';
import * as ops from './ops';
import type { Module, SplitNodeResponse, SplitTreeNode } from '@breakrecords/contract';
import { advance, baselineIncome, sale, type AdvanceOffer, type OfferAssumptions, type SaleOffer } from '@breakrecords/core/offers';

export { TODAY };

// Approvals are the first module with a live backend (Stage 0). When BR_LIVE_MODULES
// includes "approvals", these read the signed-in tenant's rows from Postgres.
async function liveCtx(module: Module = 'approvals') {
  const { authRequired, requireContext } = await import('@/server/context');
  const { isLive } = await import('@/server/modules');
  return authRequired() && isLive(module) ? requireContext() : null;
}

async function approvalItems(): Promise<ApprovalSummary[]> {
  const ctx = await liveCtx();
  if (!ctx) return allApprovals;
  const { liveApprovalItems } = await import('@/server/live/approvals');
  return liveApprovalItems(ctx);
}

export async function getHome(scenario: Scenario = 'default') {
  return {
    scenario,
    home,
    numbers: homeNumbers,
    approvals: scenario === 'empty' ? [] : await approvalItems(),
  };
}

export async function getApprovals(scenario: Scenario = 'default'): Promise<{ scenario: Scenario; items: ApprovalSummary[] }> {
  return { scenario, items: scenario === 'empty' ? [] : await approvalItems() };
}

export async function getApproval(id: string): Promise<ApprovalDetail | null> {
  const ctx = await liveCtx();
  if (!ctx) return approvalDetails[id] ?? null;
  const { liveApprovalDetail } = await import('@/server/live/approvals');
  return liveApprovalDetail(ctx, id);
}

export async function approvalIds(): Promise<string[]> {
  return (await approvalItems()).map((a) => a.id);
}

/** One release's runbook (2g). Live: built from the runbook, catalog and approved date plans. */
export async function getRelease(id: string): Promise<Release | null> {
  const ctx = await liveCtx('releases');
  if (!ctx) return releases[id] ?? null;
  return (await import('@/server/live/releases')).liveRelease(ctx, id);
}

/** Every release with a runbook. */
export async function listReleases(): Promise<Release[]> {
  const ctx = await liveCtx('releases');
  if (!ctx) return Object.values(releases);
  return (await import('@/server/live/releases')).liveReleases(ctx);
}

// ---------- Batch 2: money, splits, payee portal ----------

/** Royalties (4b). Live: computed from the tenant's income lines. Mock: the sample, plus this session's matches. */
export async function getRoyalties(): Promise<typeof royalties> {
  const ctx = await liveCtx('statements');
  if (!ctx) return (await import('@/server/mockStatements')).mockRoyalties();
  const { liveRoyalties } = await import('@/server/live/statements');
  return liveRoyalties(ctx);
}

export type StatementSummary = Pick<Statement, 'id' | 'payee' | 'payeeId' | 'release' | 'period' | 'net' | 'pays'>;
const summary = ({ id, payee, payeeId, release, period, net, pays }: Statement): StatementSummary => ({ id, payee, payeeId, release, period, net, pays });

/** Every payee statement the signed-in user may read (a payee: only their own). `payee` narrows to one name. */
export async function listStatements(payee?: string): Promise<StatementSummary[]> {
  const ctx = await liveCtx('statements');
  let list: StatementSummary[];
  if (ctx) {
    const { liveStatements } = await import('@/server/live/statements');
    list = await liveStatements(ctx);
  } else list = Object.values(statements).map(summary);
  return payee ? list.filter((s) => s.payee === payee) : list;
}

export async function getStatement(id: string): Promise<Statement | null> {
  const ctx = await liveCtx('statements');
  if (!ctx) return statements[id] ?? null;
  const { liveStatement } = await import('@/server/live/statements');
  return liveStatement(ctx, id);
}
/** Payouts (4d). Live: the tenant's batches, lines, payees and requests. */
export async function getPayouts(): Promise<typeof payouts> {
  const ctx = await liveCtx('payouts');
  if (!ctx) return (await import('@/server/mockPayouts')).mockPayouts();
  return (await import('@/server/live/payouts')).livePayouts(ctx);
}
/** Recoupment (4e). Live: each release's account, costs and entries. */
export async function getRecoupment(): Promise<typeof recoupment> {
  const ctx = await liveCtx('payouts');
  if (!ctx) return (await import('@/server/mockPayouts')).mockRecoupment();
  return (await import('@/server/live/payouts')).liveRecoupment(ctx);
}
/** Release budgets. Live: each release's budget lines. */
export async function getBudgets(): Promise<typeof budgets> {
  const ctx = await liveCtx('releases');
  if (!ctx) return budgets;
  return (await import('@/server/live/releases')).liveBudgets(ctx);
}
/** The split tree (4a). Live: the tenant's nodes. */
export async function getSplitTree(): Promise<SplitTreeNode[]> {
  const ctx = await liveCtx('splits');
  if (!ctx) return splitTree;
  const { liveSplitTree } = await import('@/server/live/splits');
  return liveSplitTree(ctx);
}

const ROLE_NAMES = { producer: 'Marco Dela', label: 'Northline Records', artist: 'Kesi Vale', feature: 'Ari Monroe' } as const;
const dayShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * One node's split, or null when it inherits its parent's. Mock: only Glasshouse recording
 * income has its own split, with draft v5 kept per browser session.
 */
export async function getDeal(nodeId: string): Promise<SplitNodeResponse | null> {
  const ctx = await liveCtx('splits');
  if (ctx) {
    const { liveSplitNode } = await import('@/server/live/splits');
    return liveSplitNode(ctx, nodeId);
  }
  if (nodeId !== 'gh-rec') return null;
  const { mockSplitState } = await import('@/server/mockSplits');
  const st = await mockSplitState();
  const d = glasshouseDeal;
  const signed = Object.fromEntries(Object.entries(st.signed).map(([role, iso]) => [ROLE_NAMES[role as keyof typeof ROLE_NAMES], dayShort(iso!)]));
  if (st.status === 'in_effect') {
    return { breadcrumb: d.breadcrumb, parties: ROLE_NAMES, dealTerms: d.dealTerms, market: d.market,
      v4: { version: 5, terms: st.terms, effective: d.v5.effective, signed }, v5: null,
      history: [{ v: 'v4', date: d.v4.effective }, ...d.history] };
  }
  return { breadcrumb: d.breadcrumb, parties: ROLE_NAMES, dealTerms: d.dealTerms, market: d.market, history: d.history,
    v4: { version: 4, terms: d.v4.terms, effective: d.v4.effective, signed: d.v4.signed },
    v5: { version: 5, status: st.status === 'sent' ? 'sent' : 'draft', terms: st.terms, effective: d.v5.effective, created: d.v5.created, signed } };
}
/** One payee's portal (4f). Live: built from their own rows; a payee can only get themselves. */
export async function getPayee(id: string): Promise<Payee | null> {
  const ctx = await liveCtx('payouts');
  if (!ctx) return payees[id] ?? null;
  return (await import('@/server/live/payouts')).livePayee(ctx, id);
}

/**
 * Whose portal to show. Live, a payee always sees themselves; the label's owner and team can
 * preview anyone's with `?as=`. Mock: `?as=` picks a sample payee; Marco Dela by default.
 */
export async function getPortalPayee(as?: string): Promise<Payee> {
  const ctx = await liveCtx('payouts');
  if (!ctx) return payees[as ?? DEFAULT_PAYEE] ?? payees[DEFAULT_PAYEE];
  const live = await import('@/server/live/payouts');
  const p = await live.livePayee(ctx, ctx.role === 'payee' ? null : (as ?? null));
  if (!p) (await import('next/navigation')).notFound();
  return p!;
}

// ---------- Batch 3: rights and operations ----------

const mockCatalog = () => ({ counts: ops.catalogCounts, recordings: ops.recordings, songs: ops.songs, releases: ops.catalogReleases, assets: ops.catalogAssets });

/** Catalog (5a). Live: the signed-in tenant's tables. Mock: the sample, plus this session's edits. */
export async function getCatalog(): Promise<ReturnType<typeof mockCatalog>> {
  const ctx = await liveCtx('catalog');
  if (ctx) {
    const { liveCatalog } = await import('@/server/live/catalog');
    return liveCatalog(ctx);
  }
  const { mockRecordingEdits } = await import('@/server/mockCatalog');
  const edits = await mockRecordingEdits();
  const base = mockCatalog();
  return { ...base, recordings: base.recordings.map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r)) };
}
export type Contracts = { summary: string; contracts: ops.Contract[]; templates: ops.Template[]; reviews: { id: string; fileName: string; status: 'queued' | 'reviewed'; requested: string }[] };
/** Contracts (5b). Live: the tenant's agreements, templates and review requests. */
export async function getContracts(): Promise<Contracts> {
  const ctx = await liveCtx('contracts');
  if (ctx) return (await import('@/server/live/contracts')).liveContracts(ctx);
  const reviews = await (await import('@/server/mockContracts')).mockReviews();
  return { summary: ops.contractsSummary, contracts: ops.contracts, templates: ops.templates, reviews };
}
export async function getTemplate(id: string): Promise<ops.Template | null> {
  return (await getContracts()).templates.find((t) => t.id === id) ?? null;
}
const mockRegistrations = () => ({ columns: ops.regColumns, rows: ops.registrations });
const mockProfileClaims = () => ({ services: ops.profileServices, rows: ops.profileClaims });

/** Rights (5c and its tabs). Live: the tenant's registrations, unclaimed royalties and profile claims. */
export async function getRegistrations(): Promise<ReturnType<typeof mockRegistrations>> {
  const ctx = await liveCtx('registrations');
  if (!ctx) return mockRegistrations();
  const { liveRegistrations } = await import('@/server/live/rights');
  return liveRegistrations(ctx);
}

export async function getUnclaimed(): Promise<typeof ops.unclaimed> {
  const ctx = await liveCtx('registrations');
  if (!ctx) return ops.unclaimed;
  const { liveUnclaimed } = await import('@/server/live/rights');
  return liveUnclaimed(ctx);
}

export async function getProfileClaims(): Promise<ReturnType<typeof mockProfileClaims>> {
  const ctx = await liveCtx('registrations');
  if (ctx) {
    const { liveProfileClaims } = await import('@/server/live/rights');
    return liveProfileClaims(ctx);
  }
  const { mockClaimsPrepared } = await import('@/server/mockRights');
  const base = mockProfileClaims();
  if (!(await mockClaimsPrepared())) return base;
  return { ...base, rows: base.rows.map((r) => ({ ...r, cells: r.cells.map((c) => (c.status === 'notStarted' ? { status: 'prepared' as const } : c)) })) };
}
export type Funding = { counts: typeof ops.fundingCounts; items: ops.FundingItem[]; applications: typeof ops.applications };
/** Funding (5d). Live: the tenant's grants and offers, minus the ones dismissed, with cards worked out from their terms. */
export async function getFunding(): Promise<Funding> {
  const ctx = await liveCtx('funding');
  if (ctx) return (await import('@/server/live/funding')).liveFunding(ctx);
  const m = await (await import('@/server/mockFunding')).mockFundingState();
  const items = ops.funding.filter((f) => !m.dismissed.has(f.id));
  return { counts: { opportunities: items.length, applications: ops.applications.length, offers: items.filter((f) => f.kind !== 'grant').length }, items, applications: ops.applications };
}

/** The comparison (5e) from offers and assumptions; numbers come from the offer math. */
export function compareOffers(ids: { advance: string; sale: string }, assumptions: OfferAssumptions, adv: AdvanceOffer, sal: SaleOffer, terms: typeof ops.offerTerms, extra: { declined: boolean; questions: { id: string; text: string; asked: string }[] }) {
  return {
    assumptions,
    baseline: baselineIncome(assumptions),
    advance: { id: ids.advance, ...advance(assumptions, adv), offer: adv, terms: terms.advance },
    sale: { id: ids.sale, ...sale(assumptions, sal), offer: sal, terms: terms.sale },
    ...extra,
  };
}
export type Offers = ReturnType<typeof compareOffers>;

/** Offer comparison. Override assumptions to recompute every number. Null when there aren't two offers to compare. */
export async function getOffers(overrides: Partial<OfferAssumptions> = {}): Promise<Offers | null> {
  const ctx = await liveCtx('funding');
  if (ctx) return (await import('@/server/live/funding')).liveOffers(ctx, overrides);
  const m = await (await import('@/server/mockFunding')).mockFundingState();
  return compareOffers({ advance: 'fund_advance', sale: 'fund_sale' }, { ...ops.offerAssumptions, ...overrides }, ops.advanceOffer, ops.saleOffer, ops.offerTerms, { declined: m.declined, questions: m.questions });
}
export type Departments = { departments: ops.Department[]; team: typeof ops.team };
/** Departments (5f). Live: the tenant's departments and team. Mock: the sample, plus this session's changes. */
export async function getDepartments(): Promise<Departments> {
  const ctx = await liveCtx('activity');
  if (ctx) return (await import('@/server/live/activity')).liveDepartments(ctx);
  const changes = await (await import('@/server/mockActivity')).mockDepartmentChanges();
  return { departments: ops.departments.map((d) => ({ ...d, ...changes[d.id] })), team: ops.team };
}
/** The activity log (5g). Live: what agents reported plus the audit log of what people did, newest first. */
export async function getActivity(): Promise<ops.ActivityEvent[]> {
  const ctx = await liveCtx('activity');
  if (!ctx) return ops.activity;
  return (await import('@/server/live/activity')).liveActivity(ctx);
}
export const getSettings = () => ({ nav: ops.settingsNav, routing: ops.routing, config: ops.labelConfig, integrations: ops.integrations, team: ops.team });
export const getTheme = () => ({ theme: ops.harborTheme, tenant: ops.tenant });
/** Roster. Live: worked out from the catalog, contracts, statements, payouts and releases. */
export async function getRoster(): Promise<typeof ops.roster> {
  const ctx = await liveCtx('roster');
  if (!ctx) return ops.roster;
  return (await import('@/server/live/roster')).liveRoster(ctx);
}
