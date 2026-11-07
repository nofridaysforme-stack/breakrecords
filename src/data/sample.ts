// Mock data source for Phase A to C. Every screen in the mockups uses this
// dataset, so seeding it reproduces the screenshots. A typed API layer
// (/api/*) replaces direct imports in Phase B.
import sample from '@design/sample-data.json';

export const label = sample.label;
export const user = sample.user;
export const pendingApprovalCount = sample.approvals.length;
