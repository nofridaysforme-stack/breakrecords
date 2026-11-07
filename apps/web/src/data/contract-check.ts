// Compile-time proof that the mock returns what the contract promises. If a fixture drifts
// from its schema, `pnpm typecheck` fails here before any test runs. The Playwright contract
// spec checks the same thing at runtime over HTTP.
import type { z } from 'zod';
import type * as C from '@breakrecords/contract';
import * as api from './api';

/** Fixtures may be readonly; the wire format isn't, so compare against a readonly view. */
type DeepReadonly<T> = T extends (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type Is<Schema extends z.ZodType, T extends DeepReadonly<z.input<Schema>>> = T;

export type Checks = [
  Is<typeof C.HomeResponse, Awaited<ReturnType<typeof api.getHome>>>,
  Is<typeof C.ApprovalsResponse, Awaited<ReturnType<typeof api.getApprovals>>>,
  Is<typeof C.ApprovalDetailResponse, NonNullable<Awaited<ReturnType<typeof api.getApproval>>>>,
  Is<typeof C.Release, NonNullable<ReturnType<typeof api.getRelease>>>,
  Is<typeof C.RoyaltiesResponse, ReturnType<typeof api.getRoyalties>>,
  Is<typeof C.StatementResponse, NonNullable<ReturnType<typeof api.getStatement>>>,
  Is<typeof C.PayoutsResponse, ReturnType<typeof api.getPayouts>>,
  Is<typeof C.RecoupmentResponse['shape']['items'], ReturnType<typeof api.getRecoupment>>,
  Is<typeof C.PayeeResponse, NonNullable<ReturnType<typeof api.getPayee>>>,
  Is<typeof C.CatalogResponse, Awaited<ReturnType<typeof api.getCatalog>>>,
  Is<typeof C.ContractsResponse, ReturnType<typeof api.getContracts>>,
  Is<typeof C.RegistrationsResponse, ReturnType<typeof api.getRegistrations>>,
  Is<typeof C.UnclaimedResponse, ReturnType<typeof api.getUnclaimed>>,
  Is<typeof C.ProfileClaimsResponse, ReturnType<typeof api.getProfileClaims>>,
  Is<typeof C.FundingResponse, ReturnType<typeof api.getFunding>>,
  Is<typeof C.OffersResponse, ReturnType<typeof api.getOffers>>,
  Is<typeof C.DepartmentsResponse, ReturnType<typeof api.getDepartments>>,
  Is<typeof C.ActivityResponse, ReturnType<typeof api.getActivity>>,
  Is<typeof C.SettingsResponse, ReturnType<typeof api.getSettings>>,
  Is<typeof C.ThemeResponse, ReturnType<typeof api.getTheme>>,
  Is<typeof C.RosterResponse, ReturnType<typeof api.getRoster>>,
];
