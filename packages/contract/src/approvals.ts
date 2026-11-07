// Approvals: the product's core "press button" moment. Anything that moves money, signs, files
// or speaks publicly becomes one of these, and nothing executes until a person approves it.
// The server enforces every rule here; the UI only mirrors them.
import { z } from 'zod';
import { Display, Id, IsoDate } from './primitives';

export const ApprovalType = z.enum(['money', 'signature', 'filing', 'public', 'plan']);
export const Risk = z.enum(['low', 'dueSoon', 'needsEyes', 'blocked']);

/** What a card and an inbox row show. */
export const ApprovalSummary = z.object({
  id: Id,
  type: ApprovalType,
  title: z.string().min(1),
  agent: z.string().min(1),
  due: Display,
  impact: z.string(),
  risk: Risk,
  context: z.string().optional(),
  riskLabel: z.string().optional(),
});

/** An approval created inside the app (a plan, an offer acceptance, a drafted contract, a claim). */
export const Proposal = ApprovalSummary.extend({
  /** Where "Review" goes. */
  href: z.string().startsWith('/'),
  /** Release date changes (2g). */
  releaseId: Id.optional(),
  newDate: IsoDate.optional(),
  /** Inbox filters. */
  artists: z.array(z.string()).optional(),
  releases: z.array(z.string()).optional(),
  dept: z.string().optional(),
});

export const DecisionStatus = z.enum(['approved', 'rejected']);
export const Decision = z.object({
  status: DecisionStatus,
  /** Epoch milliseconds. */
  at: z.number().int(),
  reason: z.string().optional(),
  /** Who decided. The mock records "you"; live records the signed-in user's id. */
  by: z.string().optional(),
  /** Audit trail id for the activity log. */
  auditId: z.string().optional(),
});

/** Everything decided or proposed in this session (mock) or tenant (live). */
export const ApprovalState = z.object({
  decisions: z.record(z.string(), Decision),
  proposals: z.array(Proposal),
});

// ---------- commands ----------

/** POST /api/approvals/{id}/decision. A rejection always needs a reason (flows.md, step 5). */
export const DecideCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(1, 'A rejection needs a reason') }),
]);

/** POST /api/approvals/decisions. Only low-risk items, never signatures (flows.md > Approval rules). */
export const BulkApproveCommand = z.object({ action: z.literal('approve'), ids: z.array(Id).min(1) });

/** POST /api/approvals. Re-proposing an existing id clears its decision so it needs a fresh one. */
export const ProposeCommand = z.object({ proposal: Proposal });

/** DELETE /api/approvals/{id}/decision undoes a decision until the action executes. */

/** Every refusal names the rule it hit, so the UI can say why in plain words. */
export const ApprovalError = z.object({
  error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'reason_required', 'not_bulk_approvable', 'blocked', 'already_executed', 'module_not_live']),
  message: z.string(),
  ids: z.array(Id).optional(),
});

export const ApprovalsResponse = z.object({ scenario: z.enum(['default', 'empty', 'working', 'blocked', 'error', 'partial']), items: z.array(ApprovalSummary) });

export type ApprovalSummary = z.infer<typeof ApprovalSummary>;
export type Proposal = z.infer<typeof Proposal>;
export type Decision = z.infer<typeof Decision>;
export type ApprovalState = z.infer<typeof ApprovalState>;
export type DecideCommand = z.infer<typeof DecideCommand>;
export type BulkApproveCommand = z.infer<typeof BulkApproveCommand>;
export type ProposeCommand = z.infer<typeof ProposeCommand>;
export type ApprovalError = z.infer<typeof ApprovalError>;
