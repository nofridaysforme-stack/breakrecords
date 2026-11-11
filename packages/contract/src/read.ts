// Read schemas for every endpoint the UI calls, frozen from the mock's responses (Stage 0).
// A live server must return the same shapes. Fields typed `Display` are pre-formatted strings
// that each module replaces with structured values when it goes live.
import { z } from 'zod';
import { AgentState, Autonomy, Bp, Cents, Display, Id, IsoDate, RegistrationStatus, Scenario, TaskState } from './primitives';
import { ApprovalSummary, ApprovalType } from './approvals';

/** Who owns or administers the songs (set in setup; a writer can override it). */
export const PublishingMode = z.enum(['self', 'publisher', 'we_publish', 'we_administer', 'writers_own']);

const Link = z.string().startsWith('/');
const Term = z.enum(['PRO', 'MLC', 'SoundExchange']);

// ---------- money building blocks ----------
export const WaterfallRow = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start'), label: z.string(), rule: z.string(), amount: Cents, source: z.string().optional(), balance: Cents }),
  z.object({ kind: z.literal('step'), label: z.string(), rule: z.string(), amount: Cents, source: z.string().optional(), balance: Cents }),
  z.object({ kind: z.literal('subtotal'), label: z.string(), balance: Cents }),
]);
export const DealTerms = z.object({ producerBp: Bp, labelOfNetBp: Bp, artistOfNetBp: Bp, featureOfArtistBp: Bp });

// ---------- Home (2c) ----------
export const HomeResponse = z.object({
  scenario: Scenario,
  home: z.object({
    today: Display,
    user: z.object({ name: z.string(), initial: z.string().length(1) }),
    brief: z.string(),
    /** Unused by the UI; the strip is built from `numbers` below. */
    numbers: z.array(z.unknown()),
    goals: z.array(z.object({ id: Id, title: z.string(), pct: z.number().int().min(0).max(100), meta: z.string(), href: Link.optional() })),
    dates: z.array(z.object({ date: Display, title: z.string(), meta: z.string() })),
    feed: z.array(z.object({ agent: z.string(), state: AgentState, text: z.string(), when: Display })),
  }),
  numbers: z.object({ income: Cents, owed: Cents, recouped: Cents, cash90: Cents, unclaimed: Cents }),
  /** What each number covers. `owedApprovalId` is the payout batch waiting on you, if any. */
  numberNotes: z.object({
    period: z.string(), income: z.string(), owed: z.string(), owedApprovalId: Id.nullable(), recouped: z.string(), cash90: z.string(), unclaimed: z.string(),
  }),
  approvals: z.array(ApprovalSummary),
});

// ---------- Approval detail (2e, 2f, filing, grant) ----------
const Evidence = z.object({
  whyLabel: z.string(), why: z.string(),
  inputs: z.array(z.object({ label: z.string(), ref: z.string(), href: z.string() })),
  steps: z.array(z.string()), auditId: z.string(),
});
const PayoutBody = z.object({
  kind: z.literal('payout'),
  stats: z.array(z.object({ label: z.string(), value: Display })),
  payees: z.array(z.object({ name: z.string(), role: z.string(), source: z.string(), taxForm: z.string(), taxState: z.enum(['ok', 'expiring', 'missing']), withheld: Cents, net: Cents })),
  total: Cents,
  waterfall: z.object({ payee: z.string(), amount: Cents, rows: z.array(WaterfallRow), totalLabel: z.string() }),
});
const ContractBody = z.object({
  kind: z.literal('contract'),
  plain: z.array(z.tuple([z.string(), z.string()])),
  flags: z.array(z.object({ id: Id, title: z.string(), ref: z.string(), draft: z.string(), playbook: z.string(), why: z.string() })),
  labelHeadNote: z.string(),
  offTemplate: z.boolean(),
  document: z.object({
    page: z.string(),
    blocks: z.array(z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('heading'), text: z.string() }),
      z.object({ kind: z.literal('clause'), text: z.string(), flagRef: z.string().optional() }),
    ])),
    footer: z.string(),
  }),
});
const FilingBody = z.object({
  kind: z.literal('filing'), org: z.string(),
  works: z.array(z.object({ title: z.string(), writers: z.string(), isrc: z.string(), iswc: z.string() })),
  facts: z.array(z.string()),
});
const ApplicationBody = z.object({
  kind: z.literal('application'), to: z.string(), ask: z.string(),
  deadline: z.object({ date: Display, verified: Display, href: z.string() }),
  fields: z.array(z.object({ label: z.string(), value: z.string(), limit: z.number().int().positive() })),
});
export const ApprovalDetailResponse = ApprovalSummary.extend({
  breadcrumb: z.string(),
  outcome: z.object({ text: z.string(), highlight: z.string().optional() }),
  primaryLabel: z.string(),
  rejectLabel: z.string(),
  evidence: Evidence,
  body: z.discriminatedUnion('kind', [PayoutBody, ContractBody, FilingBody, ApplicationBody]),
});

// ---------- Releases (2g) ----------
export const Release = z.object({
  id: Id, title: z.string(), kind: z.string(), artist: z.string(),
  date: IsoDate,
  status: z.enum(['onTrack', 'atRisk', 'blocked']),
  budget: Cents, spent: Cents,
  phases: z.array(z.object({
    name: z.string(), iso: IsoDate, until: z.boolean().optional(), status: z.enum(['done', 'now', 'future']),
    tasks: z.array(z.object({ title: z.string(), owner: z.string(), state: TaskState, gate: z.object({ owner: z.string(), waitingOn: z.string().optional() }).optional() })),
  })),
  assets: z.array(z.object({ name: z.string(), kind: z.string(), ready: z.boolean() })),
  registrations: z.array(z.object({ name: z.string(), status: RegistrationStatus, term: Term.optional() })),
  pitch: z.object({ text: z.string(), limit: z.number().int().positive() }),
  blockers: z.array(z.string()),
});
export const ReleasesResponse = z.object({ items: z.array(Release) });

// ---------- Money (4b to 4e) ----------
export const RoyaltiesResponse = z.object({
  period: Display,
  stats: z.object({ income: Cents, incomeNote: z.string(), paid: Cents, paidNote: z.string(), matched: z.number().int(), lines: z.number().int(), unclaimed: Cents, unclaimedNote: z.string() }),
  sources: z.array(z.object({ name: z.string(), amount: Cents })),
  byArtist: z.array(z.object({ name: z.string(), meta: z.string(), amount: Cents })),
  unmatched: z.object({
    count: z.number().int(), value: Cents, note: z.string(),
    /** Reported ISRCs that are one keystroke from exactly one recording. Never applied without a person. */
    suggestions: z.array(z.object({ isrc: z.string(), source: z.string(), count: z.number().int().positive(), value: Cents, recordingId: Id, recording: z.string(), recordingIsrc: z.string(), reason: z.string() })),
    /** Lines that look like nothing in the catalog. */
    unknown: z.object({ count: z.number().int(), value: Cents }),
  }),
  zeroTracks: z.array(z.object({ name: z.string(), streams: z.number().int() })),
  policyVerified: z.object({ date: Display, href: z.string() }),
});
export const StatementResponse = z.object({
  id: Id, payee: z.string(), payeeId: Id, release: z.string(), period: Display, split: z.string(), pays: z.string(),
  rows: z.array(WaterfallRow), net: Cents, auditId: z.string(),
  simple: z.array(z.object({ label: z.string(), amount: Cents })),
  qa: z.array(z.object({ question: z.string(), answer: z.string(), basis: z.string() })).optional(),
});
/** GET /api/statements: every payee statement the signed-in user may read, newest period first. */
export const StatementSummary = StatementResponse.pick({ id: true, payee: true, payeeId: true, release: true, period: true, net: true, pays: true });
export const StatementsResponse = z.object({ items: z.array(StatementSummary) });
/** POST /api/money/royalties/match: point every unmatched line carrying `isrc` at a recording. Returns 4b. */
export const MatchLinesCommand = z.object({ isrc: z.string().trim().min(1).max(20), recordingId: Id }).strict();
export const StatementError = z.object({
  error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'nothing_to_match']),
  message: z.string(),
});
export const PayeeRequestKind = z.enum(['tax_form', 'bank_details']);
export const PayoutsResponse = z.object({
  minimum: Cents,
  batches: z.array(z.object({
    id: Id, name: z.string(), payees: z.number().int(), total: Cents, status: z.enum(['awaiting', 'draft', 'sent', 'failed']), note: z.string(), approvalId: Id.optional(),
    /** The payee whose payment failed in a failed batch, and why. */
    failed: z.object({ payeeId: Id, name: z.string(), reason: z.string() }).optional(),
  })),
  taxForms: z.array(z.object({ payeeId: Id, name: z.string(), form: z.string(), status: z.enum(['ok', 'expiring', 'missing']), label: z.string(), fix: z.string().optional() })),
  carryForward: z.array(z.object({ name: z.string(), role: z.string(), amount: Cents })),
  /** Open requests to payees. Recorded here; the payout provider sends them (Stage 3). */
  requests: z.array(z.object({ payeeId: Id, kind: PayeeRequestKind })),
});
/** POST /api/money/payouts/requests: ask a payee for a tax form or new bank details. Returns 4d. */
export const RequestFromPayeeCommand = z.object({ payeeId: Id, kind: PayeeRequestKind }).strict();
/** POST /api/money/recoupment/costs: add a recoupable cost to a release. Returns 4e's items. */
export const AddRecoupableCostCommand = z.object({
  releaseId: Id, category: z.string().trim().min(1).max(60), cost: Cents.refine((c) => c > 0, 'A cost is above $0.00.'), shareBp: Bp, // 0 records a cost the label pays itself
}).strict();
export const PayoutError = z.object({ error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'already_requested']), message: z.string() });
export const RecoupmentResponse = z.object({
  items: z.array(z.object({
    id: Id, title: z.string(), artist: z.string(), advance: Cents, recouped: Cents,
    projected: Display.optional(), recoupedIn: Display.optional(),
    costs: z.array(z.object({ category: z.string(), cost: Cents, shareBp: Bp })),
  })),
});

// ---------- Splits (4a) ----------
export const SplitRole = z.enum(['producer', 'label', 'artist', 'feature']);
/**
 * One node's split. `v4` is the version in effect and `v5` the open one (draft or out for
 * signatures), named after the 4a frame; `version` gives the real numbers. `v5` is null when
 * nothing is open. `signed` maps a party's name to the date they signed.
 */
export const SplitNodeResponse = z.object({
  breadcrumb: z.array(z.string()),
  parties: z.object({ producer: z.string(), label: z.string(), artist: z.string(), feature: z.string() }),
  v4: z.object({ version: z.number().int().positive(), terms: DealTerms, effective: Display, signed: z.record(z.string(), Display) }),
  v5: z.object({
    version: z.number().int().positive(), status: z.enum(['draft', 'sent']), terms: DealTerms, effective: Display, created: Display,
    signed: z.record(z.string(), Display),
  }).nullable(),
  dealTerms: z.array(z.tuple([z.string(), z.string()])),
  market: z.object({ text: z.string(), verified: Display }),
  history: z.array(z.object({ v: z.string(), date: Display })),
});

export type SplitNodeResponse = z.infer<typeof SplitNodeResponse>;
export type SplitTreeNode = { id: string; label: string; override?: boolean; children?: SplitTreeNode[] };
export const SplitTreeNode: z.ZodType<SplitTreeNode> = z.lazy(() => z.object({
  id: Id, label: z.string(), override: z.boolean().optional(), children: z.array(SplitTreeNode).optional(),
}));
/** GET /api/splits: label, artist, release and income-type nodes. `override` marks nodes with a split of their own. */
export const SplitTreeResponse = z.array(SplitTreeNode);

/** PUT /api/splits/{node}/draft: edit the open draft. Refused once it's sent. */
export const SaveSplitDraftCommand = z.object({ terms: DealTerms });
/** POST /api/splits/{node}/send: send the draft for signatures. Refused unless net profit is exactly 100%. */
export const SendSplitCommand = z.object({}).strict();
/** POST /api/splits/{node}/sign: sign as one party. Live, a payee signs only their own line; the label signs as owner or team. */
export const SignSplitCommand = z.object({ role: SplitRole });
export const SplitError = z.object({
  error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'invalid_terms', 'not_draft', 'not_100', 'not_sent', 'already_signed', 'not_a_party']),
  message: z.string(),
});

// ---------- Payee portal (4f to 4h) ----------
export const PayeeResponse = z.object({
  id: Id, first: z.string(), name: z.string(), label: z.string(), labelShort: z.string(),
  earned: Cents, paid: Cents,
  next: z.object({ amount: Cents, date: Display, from: z.string() }),
  tax: z.object({ ok: z.boolean(), label: z.string(), form: z.string(), expires: Display.optional() }),
  /** The last 4 digits only; the account lives with the payout provider. Null until one is on file. */
  bank: z.object({ last4: z.string().regex(/^\d{4}$/), name: z.string() }).nullable(),
  statementIds: z.array(Id),
  splits: z.array(z.object({ title: z.string(), meta: z.string(), terms: z.string(), status: z.enum(['signed', 'waiting']), note: z.string(), v5: z.boolean().optional() })),
  signPrompt: z.object({ title: z.string(), text: z.string() }),
});

// ---------- Catalog (5a) ----------
/** What a store needs to know about AI in a recording. "None" is a declaration; "Not declared" is a gap. */
export const AiUseLabel = z.enum(['Not declared', 'None', 'Partial, stems', 'Partial, vocals', 'Partial, artwork', 'Full']);
export const Recording = z.object({
  id: Id, title: z.string(), artist: z.string(), isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/).nullable(),
  score: z.number().int().min(0).max(100), ai: z.string(), duration: Display, upc: z.string().regex(/^\d{12,13}$/).nullable(),
  song: z.string(), iswc: z.string().nullable(), genre: z.string().nullable(),
  credits: z.array(z.object({ name: z.string(), role: z.string() })), note: z.string(),
});
/** PATCH /api/catalog/recordings/{id}. Identifiers and credits come from the distributor and signed agreements, so only these change here. */
export const UpdateRecordingCommand = z.object({
  genre: z.string().trim().max(60).nullable().optional(),
  ai: AiUseLabel.optional(),
  /** Typed with or without hyphens; null removes it. Checked against the ISRC format. */
  isrc: z.string().trim().max(20).nullable().optional(),
}).refine((c) => c.genre !== undefined || c.ai !== undefined || c.isrc !== undefined, 'Send a genre, an AI use or an ISRC.');
export type Recording = z.infer<typeof Recording>;
export type UpdateRecordingCommand = z.infer<typeof UpdateRecordingCommand>;
export const CatalogResponse = z.object({
  counts: z.object({ songs: z.number().int(), recordings: z.number().int(), releases: z.number().int(), assets: z.number().int() }),
  recordings: z.array(Recording),
  songs: z.array(z.object({ id: Id, title: z.string(), writers: z.string(), iswc: z.string().nullable(), recordings: z.number().int(), mlc: RegistrationStatus })),
  releases: z.array(z.object({ id: Id, title: z.string(), artist: z.string(), kind: z.string(), date: Display, upc: z.string(), tracks: z.number().int(), href: Link.optional() })),
  assets: z.array(z.object({ name: z.string(), kind: z.string(), release: z.string(), ready: z.boolean() })),
});

// ---------- Contracts (5b) ----------
export const Template = z.object({
  id: Id, name: z.string(), version: z.string(), updated: Display, summary: z.string(),
  clauses: z.array(z.object({ title: z.string(), text: z.string() })), playbook: z.array(z.string()),
});
export const ContractsResponse = z.object({
  summary: z.string(),
  contracts: z.array(z.object({
    id: Id, name: z.string(), template: z.string(), templateId: Id.optional(), parties: z.string(), terms: z.string(),
    date: Display.nullable(), dateWhat: z.string(), sig: z.string(), sigState: z.enum(['waiting', 'signed', 'partial']), href: Link.optional(),
  })),
  templates: z.array(Template),
  /** Contracts uploaded for Legal Agent to check, newest first. */
  reviews: z.array(z.object({ id: Id, fileName: z.string(), status: z.enum(['queued', 'reviewed']), requested: Display })),
});
/** POST /api/contracts/reviews: send an uploaded contract to Legal Agent. The file arrives with uploads; only its name is recorded today. */
export const RequestContractReviewCommand = z.object({ fileName: z.string().trim().min(1).max(200).regex(/\.(pdf|docx?)$/i, 'A PDF or Word file.') }).strict();
export const ContractError = z.object({ error: z.enum(['invalid', 'unauthorized', 'forbidden']), message: z.string() });

// ---------- Rights (5c and the undrawn tabs) ----------
const Cell = z.object({ status: RegistrationStatus, ref: z.string().optional() });
export const RegistrationsResponse = z.object({
  columns: z.array(z.object({ key: z.string(), name: z.string(), sub: z.string(), term: Term.optional() })),
  rows: z.array(z.object({ id: Id, name: z.string(), artist: z.string(), cells: z.array(Cell).length(6) })),
});
export const UnclaimedResponse = z.object({
  total: Cents,
  items: z.array(z.object({ id: Id, source: z.string(), what: z.string(), amount: Cents, why: z.string(), since: Display, claim: z.string() })),
});
export const ProfileClaimsResponse = z.object({ services: z.array(z.string()), rows: z.array(z.object({ artist: z.string(), cells: z.array(Cell) })) });
/** POST /api/rights/claims/prepare: Rights Agent prepares every claim not yet started; the artist confirms by email. Returns the updated claims. */
export const PrepareProfileClaimsCommand = z.object({}).strict();

// ---------- Funding (5d, 5e) ----------
export const FundingResponse = z.object({
  counts: z.object({ opportunities: z.number().int(), applications: z.number().int(), offers: z.number().int() }),
  items: z.array(z.object({
    id: Id, kind: z.enum(['grant', 'advance', 'sale']), type: z.string(), title: z.string(), amount: Display,
    cost: Display, costTone: z.enum(['good', 'plain', 'critical']), deadline: Display, draft: z.string(), fit: Display,
    verified: Display, permanent: z.boolean(), primary: z.object({ label: z.string(), href: Link }),
  })),
  applications: z.array(z.object({ id: Id, title: z.string(), amount: Display, status: z.string(), due: Display, agent: z.string(), href: Link })),
});
const OfferTerms = z.object({ from: z.string(), received: Display, open: Display, buyBack: z.string() });
export const OffersResponse = z.object({
  assumptions: z.object({ annualIncome: Cents, growthBp: z.number().int(), albumAnnualIncome: Cents, years: z.number().int().positive() }),
  baseline: Cents,
  advance: z.object({ id: Id, cash: Cents, cost: Cents, months: z.number().int(), yearlyCostBp: z.number().int(), income: Cents, offer: z.object({ kind: z.literal('advance'), cash: Cents, repayTotal: Cents, shareBp: Bp }), terms: OfferTerms }),
  sale: z.object({ id: Id, cash: Cents, cost: Cents, yearlyCostBp: z.number().int(), income: Cents, offer: z.object({ kind: z.literal('sale'), cash: Cents, shareBp: Bp, album: z.string() }), terms: OfferTerms }),
  /** The sale was declined (Finance Agent drafts the reply; undo works until it's sent). */
  declined: z.boolean(),
  /** Questions for the offerers, newest first. Finance Agent drafts each email for the label to send. */
  questions: z.array(z.object({ id: Id, text: z.string(), asked: Display })),
});
/** POST /api/funding/questions: save a question for the offerers. Returns the comparison. */
export const AskFundingQuestionCommand = z.object({ question: z.string().trim().min(1).max(500) }).strict();
export const FundingError = z.object({ error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'not_an_offer']), message: z.string() });

// ---------- Departments, activity, settings, theme, roster (5f to 5i) ----------
const TeamMember = z.object({ id: Id, name: z.string(), role: z.string() });
export const DepartmentsResponse = z.object({
  departments: z.array(z.object({
    id: Id, name: z.string(), agent: z.string(), state: z.union([AgentState, z.literal('later')]), stateLabel: z.string(),
    autonomy: Autonomy.nullable(), tasks: z.number().int().nullable(), spendCap: Cents.nullable(), phase: z.union([z.literal(1), z.literal(2)]),
    canAct: z.boolean(), actNote: z.string(),
    /** The team member it's handed to, or null. */
    personId: Id.nullable(),
  })),
  team: z.array(TeamMember),
});
/** PATCH /api/departments/{id}: change how much a department does alone, or who it's handed to. */
export const UpdateDepartmentCommand = z.object({ autonomy: Autonomy.optional(), personId: Id.nullable().optional() }).strict()
  .refine((c) => c.autonomy !== undefined || c.personId !== undefined, 'Send an autonomy level or a person.');
export const DepartmentError = z.object({ error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'not_allowed', 'not_on_team']), message: z.string() });
export const ActivityResponse = z.array(z.object({
  id: Id, when: Display, kind: z.enum(['Agent run', 'Flag', 'Error', 'Approval', 'Tool call', 'Edit']),
  text: z.string(), who: z.string(), dept: z.string(), inputs: z.array(z.string()), reasoning: z.string(), output: z.string(),
}));
export const SettingsResponse = z.object({
  nav: z.array(z.object({ id: Id, label: z.string() })),
  routing: z.array(z.object({ type: ApprovalType, label: z.string(), rule: z.string(), who: z.string(), cap: Display })),
  config: z.object({
    name: z.string(), country: z.string().length(2), profile: z.string(), statementPeriod: z.string(), minimumPayout: Cents, spendCap: Cents,
    /** The level chosen in setup, which new departments start at. Null before setup. */
    defaultAutonomy: Autonomy.nullable().optional(),
    publishingMode: PublishingMode.nullable().optional(),
  }),
  integrations: z.array(z.object({ id: Id, name: z.string(), abbr: z.string(), state: z.enum(['ok', 'off', 'err']), status: z.string() })),
  team: z.array(TeamMember),
  /** Invitations (owners only): who may sign in, and whether they have. */
  invites: z.array(z.object({ email: z.email(), role: z.enum(['owner', 'team', 'payee']), payee: z.string().nullable(), added: Display, joined: z.boolean() })),
  canInvite: z.boolean(),
  /** Payees a payee invitation can be linked to (so they see their own statements and splits). */
  payeeOptions: z.array(z.object({ id: Id, name: z.string() })),
});
/**
 * POST /api/settings/invites. Who they'll be: a co-owner, a team member, or an artist or other
 * payee (an existing one, or a new one added by name).
 */
export const InviteCommand = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(['owner', 'team', 'payee']),
  payeeId: Id.optional(),
  newPayee: z.object({ name: z.string().trim().min(1).max(120) }).strict().optional(),
}).strict()
  .refine((c) => c.role !== 'payee' || !!c.payeeId !== !!c.newPayee, 'Pick an existing payee or name a new one.');
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const ThemeResponse = z.object({
  theme: z.object({ background: Hex, surface: Hex, brand: Hex, primary: Hex, text: Hex }),
  tenant: z.object({ name: z.string(), domain: z.string(), email: z.email(), dns: z.string(), subTenants: z.array(z.object({ name: z.string(), artists: z.number().int() })) }),
  /** When the theme was last published and by whom; null if it never was. */
  published: z.object({ at: Display, by: z.string() }).nullable(),
  /** Only the licensee's owners can publish its theme. */
  canPublish: z.boolean(),
});
/** POST /api/settings/theme: publish the five colors. Refused unless every text pair passes WCAG AA. */
export const PublishThemeCommand = z.object({ theme: ThemeResponse.shape.theme }).strict();
export const SettingsError = z.object({ error: z.enum(['invalid', 'unauthorized', 'forbidden', 'not_found', 'fails_contrast', 'not_yet']), message: z.string() });
/** GET /api/search?q=: the ⌘K results for the signed-in tenant, best first. */
export const SearchResponse = z.object({
  items: z.array(z.object({ id: Id, group: z.enum(['Go to', 'Approvals', 'Catalog', 'People', 'Money', 'Contracts', 'Funding']), label: z.string(), hint: z.string(), href: Link, keywords: z.string().optional() })),
});
// ---------- Onboarding (2a, 2b and the undrawn steps) ----------
export const OnboardingAnswers = z.object({
  profile: z.enum(['solo', 'band', 'small_label', 'growing_label', 'services']),
  name: z.string().trim().max(120),
  country: z.enum(['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'Another country']),
  distributor: z.string().max(60).nullable(),
  catalogFile: z.string().max(200).nullable(),
  pro: z.object({ status: z.enum(['affiliated', 'not_yet', 'not_sure']), org: z.string().max(40).optional() }),
  autonomy: Autonomy,
  /** A band's other members, who become co-owners (by email; they sign in with it). */
  members: z.array(z.email()).max(10).optional(),
  /**
   * The songwriting step: who owns or administers the songs (PUB-02). Artists publish their own
   * songs or have a publisher; labels and services publish, administer, or leave it to the writers.
   */
  publishing: z.object({
    mode: PublishingMode,
    /** Digits only, as typed; kept once it's a full IPI (9 to 11 digits). */
    ipi: z.string().regex(/^\d{0,11}$/).optional(),
  }).optional(),
});
/**
 * GET /api/onboarding: the answers so far, saved as the person goes. `live` is a real workspace
 * (sign-in on), whose setup starts blank (`defaults`) rather than from the sample label.
 */
export const OnboardingResponse = z.object({
  answers: OnboardingAnswers.nullable(), completed: z.boolean(), live: z.boolean().optional(), defaults: OnboardingAnswers.optional(),
  /** Re-running setup: departments set to their own level, which setup leaves alone. */
  customDepartments: z.array(z.string()).optional(),
});
/** PUT /api/onboarding: save the answers; `complete` sets the label up from them (profile, country, how much agents do). */
export const SaveOnboardingCommand = z.object({ answers: OnboardingAnswers, complete: z.boolean().optional() }).strict();
export const RosterResponse = z.array(z.object({
  id: Id, name: z.string(), type: z.string(), genre: z.string(), releases: z.number().int(), contract: z.string(), income: Cents, open: z.string(), href: Link,
}));

// ---------- Prepared documents (Rights → Documents) ----------

export const DocKind = z.enum(['split_sheet', 'registration_packet', 'copyright_worksheet', 'label_copy']);
export const DocSubject = z.enum(['work', 'recording', 'release']);
export const DocGap = z.object({ severity: z.enum(['blocker', 'warning']), field: z.string(), message: z.string() });
export const DocReview = z.object({
  id: z.string(), model: z.string(), at: z.string(),
  findings: z.array(z.object({ severity: z.enum(['problem', 'check']), message: z.string() })),
  nextSteps: z.string(),
});
export const DocVersion = z.object({
  id: z.string(), version: z.number().int().positive(), preparedAt: z.string(), preparedBy: z.string(),
  gaps: z.array(DocGap), summary: z.string(), hasCsv: z.boolean(), review: DocReview.nullable(),
});
export const DocSlot = z.object({ kind: DocKind, label: z.string(), latest: DocVersion.nullable(), versions: z.number().int().nonnegative() });
export const DocSubjectRow = z.object({ subject: DocSubject, id: z.string(), title: z.string(), artist: z.string(), detail: z.string(), docs: z.array(DocSlot) });
export const DocumentsResponse = z.object({
  ai: z.object({ available: z.boolean(), on: z.boolean(), canChange: z.boolean(), note: z.string() }),
  artists: z.array(z.string()),
  subjects: z.array(DocSubjectRow),
});
export const PrepareDocumentCommand = z.object({ kind: DocKind, subject: DocSubject, id: z.string().min(1) }).strict();
export const SetAiAssistCommand = z.object({ on: z.boolean() }).strict();
export type DocumentsResponse = z.infer<typeof DocumentsResponse>;
export type DocVersion = z.infer<typeof DocVersion>;
export type DocReview = z.infer<typeof DocReview>;

// ---------- Session (signed in only; not a label endpoint) ----------
const Place = z.object({ id: z.string().uuid(), name: z.string(), kind: z.enum(['artist', 'label', 'licensee']) });
/**
 * GET /api/session/tenant: where you are, the workspaces you run or work in, and the labels
 * that pay you (connections: you see only what your deal with each covers).
 */
export const SessionResponse = z.object({
  current: z.string().uuid(),
  workspaces: z.array(Place.extend({ role: z.enum(['owner', 'team']) })),
  connections: z.array(Place),
});
/** POST /api/session/workspace: start a workspace of your own; you're switched into it. */
export const StartedWorkspace = z.object({ tenantId: z.string().uuid() });
/** POST /api/settings/invites answers with the settings and whether the invitation email went out. */
export const InviteResponse = SettingsResponse.extend({ emailed: z.boolean() });

// ---------- Invite codes (Indie SRVCS staff only; not a label endpoint) ----------

export const InviteCode = z.object({
  id: z.string(), hint: z.string(), note: z.string(), maxUses: z.number().int().positive(), uses: z.number().int().nonnegative(),
  expires: z.string().nullable(), status: z.enum(['active', 'used_up', 'expired', 'revoked']), created: z.string(), signedUp: z.array(z.string()),
});
export const InviteCodesResponse = z.object({ codes: z.array(InviteCode) });
export const CreateInviteCodeCommand = z.object({
  note: z.string().trim().min(1).max(120),
  maxUses: z.number().int().min(1).max(1000),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
}).strict();
/** The new code is in the response once, and never again. */
export const CreatedInviteCode = InviteCodesResponse.extend({ code: z.string() });
export type InviteCodesResponse = z.infer<typeof InviteCodesResponse>;

// ---------- Clients (label services workspaces) ----------

export const ClientsResponse = z.object({
  clients: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['artist', 'label']), added: z.string(), people: z.number().int().nonnegative() })),
  /** Any top-level workspace can add clients. A client workspace can't, and says whose client it is. */
  canAdd: z.boolean().optional(),
  clientOf: z.string().nullable().optional(),
});
export const CreateClientCommand = z.object({ name: z.string().trim().min(1).max(120), kind: z.enum(['artist', 'label']) }).strict();
export type ClientsResponse = z.infer<typeof ClientsResponse>;

// ---------- Recording and product codes (ISRC, UPC) ----------

/** PATCH /api/catalog/releases/{id}: the release's UPC (or EAN), checked; null removes it. */
export const UpdateReleaseCommand = z.object({ upc: z.string().trim().max(20).nullable() }).strict();
/** GET /api/catalog/codes: the workspace's prefixes and the next code each would give. */
export const CodesResponse = z.object({
  isrcPrefix: z.string().nullable(), gs1Prefix: z.string().nullable(),
  nextIsrc: z.string().nullable(), nextUpc: z.string().nullable(), canChange: z.boolean(),
});
/** PUT /api/catalog/codes (owners). Empty clears a prefix. */
export const SetCodePrefixesCommand = z.object({ isrcPrefix: z.string().trim().max(10).nullable(), gs1Prefix: z.string().trim().max(14).nullable() }).strict();
/** POST /api/catalog/codes/assign: give a recording the next ISRC, or a release the next UPC. */
export const AssignCodeCommand = z.object({ kind: z.enum(['isrc', 'upc']), id: Id }).strict();
export const AssignedCode = z.object({ kind: z.enum(['isrc', 'upc']), id: z.string(), code: z.string() });
export type CodesResponse = z.infer<typeof CodesResponse>;
