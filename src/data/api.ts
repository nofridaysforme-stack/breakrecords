// Mock API: the single source the route handlers (/api/*) and server components
// read from. Replace these functions with real calls; the shapes stay the same.
import { budgets, glasshouseDeal, payees, payouts, recoupment, royalties, splitTree, statements } from './money';
import { approvals as allApprovals } from './sample';
import { approvalDetails, home, homeNumbers, releases, TODAY } from './fixtures';
import type { ApprovalDetail, Release, Scenario } from './types';
import type { ApprovalSummary } from '@/components/ui/Approval';
import * as ops from './ops';
import { advance, baselineIncome, sale, type OfferAssumptions } from '@/lib/offers';

export { TODAY };

export function getHome(scenario: Scenario = 'default') {
  return {
    scenario,
    home,
    numbers: homeNumbers,
    approvals: scenario === 'empty' ? [] : allApprovals,
  };
}

export function getApprovals(scenario: Scenario = 'default'): { scenario: Scenario; items: ApprovalSummary[] } {
  return { scenario, items: scenario === 'empty' ? [] : allApprovals };
}

export function getApproval(id: string): ApprovalDetail | null {
  return approvalDetails[id] ?? null;
}

export function approvalIds(): string[] {
  return allApprovals.map((a) => a.id);
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

export const getCatalog = () => ({ counts: ops.catalogCounts, recordings: ops.recordings, songs: ops.songs, releases: ops.catalogReleases, assets: ops.catalogAssets });
export const getContracts = () => ({ summary: ops.contractsSummary, contracts: ops.contracts, templates: ops.templates });
export const getTemplate = (id: string) => ops.templates.find((t) => t.id === id) ?? null;
export const getRegistrations = () => ({ columns: ops.regColumns, rows: ops.registrations });
export const getUnclaimed = () => ops.unclaimed;
export const getProfileClaims = () => ({ services: ops.profileServices, rows: ops.profileClaims });
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
