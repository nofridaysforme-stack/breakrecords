// Read schemas for every endpoint the UI calls, frozen from the mock's responses (Stage 0).
// A live server must return the same shapes. Fields typed `Display` are pre-formatted strings
// that each module replaces with structured values when it goes live.
import { z } from 'zod';
import { AgentState, Autonomy, Bp, Cents, Display, Id, IsoDate, RegistrationStatus, Scenario, TaskState } from './primitives';
import { ApprovalSummary, ApprovalType } from './approvals';

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
  unmatched: z.object({ count: z.number().int(), value: Cents, note: z.string() }),
  zeroTracks: z.array(z.object({ name: z.string(), streams: z.number().int() })),
  policyVerified: z.object({ date: Display, href: z.string() }),
});
export const StatementResponse = z.object({
  id: Id, payee: z.string(), payeeId: Id, release: z.string(), period: Display, split: z.string(), pays: z.string(),
  rows: z.array(WaterfallRow), net: Cents, auditId: z.string(),
  simple: z.array(z.object({ label: z.string(), amount: Cents })),
  qa: z.array(z.object({ question: z.string(), answer: z.string(), basis: z.string() })).optional(),
});
export const PayoutsResponse = z.object({
  minimum: Cents,
  batches: z.array(z.object({ id: Id, name: z.string(), payees: z.number().int(), total: Cents, status: z.enum(['awaiting', 'draft', 'sent', 'failed']), note: z.string(), approvalId: Id.optional() })),
  taxForms: z.array(z.object({ name: z.string(), form: z.string(), status: z.enum(['ok', 'expiring', 'missing']), label: z.string(), fix: z.string().optional() })),
  carryForward: z.array(z.object({ name: z.string(), role: z.string(), amount: Cents })),
});
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
  bank: z.object({ last4: z.string().regex(/^\d{4}$/), name: z.string() }),
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
}).refine((c) => c.genre !== undefined || c.ai !== undefined, 'Send a genre or an AI use.');
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
});

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
  advance: z.object({ cash: Cents, cost: Cents, months: z.number().int(), yearlyCostBp: z.number().int(), income: Cents, offer: z.object({ kind: z.literal('advance'), cash: Cents, repayTotal: Cents, shareBp: Bp }), terms: OfferTerms }),
  sale: z.object({ cash: Cents, cost: Cents, yearlyCostBp: z.number().int(), income: Cents, offer: z.object({ kind: z.literal('sale'), cash: Cents, shareBp: Bp, album: z.string() }), terms: OfferTerms }),
});

// ---------- Departments, activity, settings, theme, roster (5f to 5i) ----------
const TeamMember = z.object({ id: Id, name: z.string(), role: z.string() });
export const DepartmentsResponse = z.object({
  departments: z.array(z.object({
    id: Id, name: z.string(), agent: z.string(), state: z.union([AgentState, z.literal('later')]), stateLabel: z.string(),
    autonomy: Autonomy.nullable(), tasks: z.number().int().nullable(), spendCap: Cents.nullable(), phase: z.union([z.literal(1), z.literal(2)]),
    canAct: z.boolean(), actNote: z.string(),
  })),
  team: z.array(TeamMember),
});
export const ActivityResponse = z.array(z.object({
  id: Id, when: Display, kind: z.enum(['Agent run', 'Flag', 'Error', 'Approval', 'Tool call', 'Edit']),
  text: z.string(), who: z.string(), dept: z.string(), inputs: z.array(z.string()), reasoning: z.string(), output: z.string(),
}));
export const SettingsResponse = z.object({
  nav: z.array(z.object({ id: Id, label: z.string() })),
  routing: z.array(z.object({ type: ApprovalType, label: z.string(), rule: z.string(), who: z.string(), cap: Display })),
  config: z.object({ name: z.string(), country: z.string().length(2), profile: z.string(), statementPeriod: z.string(), minimumPayout: Cents, spendCap: Cents }),
  integrations: z.array(z.object({ id: Id, name: z.string(), abbr: z.string(), state: z.enum(['ok', 'off', 'err']), status: z.string() })),
  team: z.array(TeamMember),
});
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const ThemeResponse = z.object({
  theme: z.object({ background: Hex, surface: Hex, brand: Hex, primary: Hex, text: Hex }),
  tenant: z.object({ name: z.string(), domain: z.string(), email: z.email(), dns: z.string(), subTenants: z.array(z.object({ name: z.string(), artists: z.number().int() })) }),
});
export const RosterResponse = z.array(z.object({
  id: Id, name: z.string(), type: z.string(), genre: z.string(), releases: z.number().int(), contract: z.string(), income: Cents, open: z.string(), href: Link,
}));
