// Every GET the UI makes, with the schema its response must satisfy. The same list runs against
// the mock server now and the live server later (strategy: "Contract tests").
import type { z } from 'zod';
import { ApprovalState, ApprovalsResponse } from './approvals';
import * as R from './read';

export type Endpoint = { path: string; schema: z.ZodType; module: Module };

/** The API areas that flip from mock to live one at a time (strategy: "Flip modules with a flag"). */
export const MODULES = ['approvals', 'catalog', 'contracts', 'roster', 'splits', 'statements', 'payouts', 'registrations', 'releases', 'funding', 'activity', 'settings'] as const;
export type Module = (typeof MODULES)[number];

export const ENDPOINTS: Endpoint[] = [
  { path: '/api/home', schema: R.HomeResponse, module: 'approvals' },
  { path: '/api/approvals', schema: ApprovalsResponse, module: 'approvals' },
  { path: '/api/approvals/state', schema: ApprovalState, module: 'approvals' },
  { path: '/api/approvals/apr_payout_oct', schema: R.ApprovalDetailResponse, module: 'approvals' },
  { path: '/api/approvals/apr_producer', schema: R.ApprovalDetailResponse, module: 'approvals' },
  { path: '/api/approvals/apr_mlc', schema: R.ApprovalDetailResponse, module: 'approvals' },
  { path: '/api/approvals/apr_grant', schema: R.ApprovalDetailResponse, module: 'approvals' },
  { path: '/api/releases', schema: R.ReleasesResponse, module: 'releases' },
  { path: '/api/releases/rel_glasshouse', schema: R.Release, module: 'releases' },
  { path: '/api/money/royalties', schema: R.RoyaltiesResponse, module: 'statements' },
  { path: '/api/statements/ST-2026-10-KV', schema: R.StatementResponse, module: 'statements' },
  { path: '/api/statements/ST-2026-10-MD', schema: R.StatementResponse, module: 'statements' },
  { path: '/api/money/payouts', schema: R.PayoutsResponse, module: 'payouts' },
  { path: '/api/money/recoupment', schema: R.RecoupmentResponse, module: 'payouts' },
  { path: '/api/splits', schema: R.SplitTreeResponse, module: 'splits' },
  { path: '/api/splits/gh-rec', schema: R.SplitNodeResponse, module: 'splits' },
  { path: '/api/portal/marco', schema: R.PayeeResponse, module: 'payouts' },
  { path: '/api/portal/kesi', schema: R.PayeeResponse, module: 'payouts' },
  { path: '/api/catalog', schema: R.CatalogResponse, module: 'catalog' },
  { path: '/api/contracts', schema: R.ContractsResponse, module: 'contracts' },
  { path: '/api/contracts/templates/artist', schema: R.Template, module: 'contracts' },
  { path: '/api/rights/registrations', schema: R.RegistrationsResponse, module: 'registrations' },
  { path: '/api/rights/unclaimed', schema: R.UnclaimedResponse, module: 'registrations' },
  { path: '/api/rights/claims', schema: R.ProfileClaimsResponse, module: 'registrations' },
  { path: '/api/funding', schema: R.FundingResponse, module: 'funding' },
  { path: '/api/funding/offers', schema: R.OffersResponse, module: 'funding' },
  { path: '/api/departments', schema: R.DepartmentsResponse, module: 'activity' },
  { path: '/api/activity', schema: R.ActivityResponse, module: 'activity' },
  { path: '/api/settings', schema: R.SettingsResponse, module: 'settings' },
  { path: '/api/settings/theme', schema: R.ThemeResponse, module: 'settings' },
  { path: '/api/roster', schema: R.RosterResponse, module: 'roster' },
];
