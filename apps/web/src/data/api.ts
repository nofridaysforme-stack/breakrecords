import 'server-only';

// Mock API: the single source the route handlers (/api/*) and server components
// read from. Replace these functions with real calls; the shapes stay the same.
import { budgets, glasshouseDeal, payees, payouts, recoupment, royalties, splitTree, statements } from './money';
import { approvals as allApprovals } from './sample';
import { approvalDetails, home, homeNumbers, releases, TODAY } from './fixtures';
import type { ApprovalDetail, Release, Scenario } from './types';
import type { ApprovalSummary } from '@/components/ui/Approval';
import * as ops from './ops';
import type { Module } from '@breakrecords/contract';
import { advance, baselineIncome, sale, type OfferAssumptions } from '@breakrecords/core/offers';

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

export function getRelease(id: string): Release | null {
  return releases[id] ?? null;
}

export function listReleases(): Release[] {
  return Object.values(releases);
}

// ---------- Batch 2: money, splits, payee portal ----------

export const getRoyalties = () => royalties;
export const listStatements = () => Object.values(statements);
export const getStatement = (id: string) => statements[id] ?? null;
export const getPayouts = () => payouts;
export const getRecoupment = () => recoupment;
export const getBudgets = () => budgets;
export const getSplitTree = () => splitTree;
/** Only Glasshouse recording income has its own split; other nodes inherit or are not set up. */
export const getDeal = (nodeId: string) => (nodeId === 'gh-rec' ? glasshouseDeal : null);
export const getPayee = (id: string) => payees[id as keyof typeof payees] ?? null;

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
export const getContracts = () => ({ summary: ops.contractsSummary, contracts: ops.contracts, templates: ops.templates });
export const getTemplate = (id: string) => ops.templates.find((t) => t.id === id) ?? null;
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
export const getFunding = () => ({ counts: ops.fundingCounts, items: ops.funding, applications: ops.applications });
/** Offer comparison. Pass other assumptions to recompute every number. */
export function getOffers(assumptions: OfferAssumptions = ops.offerAssumptions) {
  return {
    assumptions,
    baseline: baselineIncome(assumptions),
    advance: { ...advance(assumptions, ops.advanceOffer), offer: ops.advanceOffer, terms: ops.offerTerms.advance },
    sale: { ...sale(assumptions, ops.saleOffer), offer: ops.saleOffer, terms: ops.offerTerms.sale },
  };
}
export const getDepartments = () => ({ departments: ops.departments, team: ops.team });
export const getActivity = () => ops.activity;
export const getSettings = () => ({ nav: ops.settingsNav, routing: ops.routing, config: ops.labelConfig, integrations: ops.integrations, team: ops.team });
export const getTheme = () => ({ theme: ops.harborTheme, tenant: ops.tenant });
export const getRoster = () => ops.roster;
