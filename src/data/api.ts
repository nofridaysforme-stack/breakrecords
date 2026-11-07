// Mock API: the single source the route handlers (/api/*) and server components
// read from. Replace these functions with real calls; the shapes stay the same.
import { budgets, glasshouseDeal, payees, payouts, recoupment, royalties, splitTree, statements } from './money';
import { approvals as allApprovals } from './sample';
import { approvalDetails, home, homeNumbers, releases, TODAY } from './fixtures';
import type { ApprovalDetail, Release, Scenario } from './types';
import type { ApprovalSummary } from '@/components/ui/Approval';

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
