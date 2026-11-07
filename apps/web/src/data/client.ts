// Typed client for the mock API, for client components and a future real backend.
import type { ApprovalSummary } from '@/components/ui/Approval';
import type { ApprovalDetail, Release, Scenario } from './types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

export const client = {
  approvals: (state: Scenario = 'default') => get<{ scenario: Scenario; items: ApprovalSummary[] }>(`/api/approvals?state=${state}`),
  approval: (id: string) => get<ApprovalDetail>(`/api/approvals/${encodeURIComponent(id)}`),
  releases: () => get<{ items: Release[] }>('/api/releases'),
  release: (id: string) => get<Release>(`/api/releases/${encodeURIComponent(id)}`),
};
