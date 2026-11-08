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
  Is<typeof C.Release, NonNullable<Awaited<ReturnType<typeof api.getRelease>>>>,
  Is<typeof C.RoyaltiesResponse, Awaited<ReturnType<typeof api.getRoyalties>>>,
  Is<typeof C.StatementsResponse['shape']['items'], Awaited<ReturnType<typeof api.listStatements>>>,
  Is<typeof C.StatementResponse, NonNullable<Awaited<ReturnType<typeof api.getStatement>>>>,
  Is<typeof C.PayoutsResponse, Awaited<ReturnType<typeof api.getPayouts>>>,
  Is<typeof C.RecoupmentResponse['shape']['items'], Awaited<ReturnType<typeof api.getRecoupment>>>,
  Is<typeof C.PayeeResponse, NonNullable<Awaited<ReturnType<typeof api.getPayee>>>>,
  Is<typeof C.CatalogResponse, Awaited<ReturnType<typeof api.getCatalog>>>,
  Is<typeof C.ContractsResponse, Awaited<ReturnType<typeof api.getContracts>>>,
  Is<typeof C.RegistrationsResponse, Awaited<ReturnType<typeof api.getRegistrations>>>,
  Is<typeof C.UnclaimedResponse, Awaited<ReturnType<typeof api.getUnclaimed>>>,
  Is<typeof C.ProfileClaimsResponse, Awaited<ReturnType<typeof api.getProfileClaims>>>,
  Is<typeof C.FundingResponse, Awaited<ReturnType<typeof api.getFunding>>>,
  Is<typeof C.OffersResponse, NonNullable<Awaited<ReturnType<typeof api.getOffers>>>>,
  Is<typeof C.DepartmentsResponse, ReturnType<typeof api.getDepartments>>,
  Is<typeof C.ActivityResponse, ReturnType<typeof api.getActivity>>,
  Is<typeof C.SettingsResponse, ReturnType<typeof api.getSettings>>,
  Is<typeof C.ThemeResponse, ReturnType<typeof api.getTheme>>,
  Is<typeof C.RosterResponse, Awaited<ReturnType<typeof api.getRoster>>>,
];
