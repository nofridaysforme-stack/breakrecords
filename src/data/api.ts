// Mock API: the single source the route handlers (/api/*) and server components
// read from. Replace these functions with real calls; the shapes stay the same.
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
