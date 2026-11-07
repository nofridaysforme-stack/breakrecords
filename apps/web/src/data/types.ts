// Domain types for the mock API. Money is integer cents everywhere.
import type { ApprovalSummary } from '@/components/ui/Approval';
import type { NumberTile } from '@/components/ui/Blocks';
import type { AgentState, Status, TaskState } from '@/components/ui/Status';
import type { Cents } from '@breakrecords/core/money';
import type { WaterfallRow } from '@breakrecords/core/waterfall';

/** Which data condition a screen shows (flows.md > States). `?state=` selects it. */
export type Scenario = 'default' | 'empty' | 'working' | 'blocked' | 'error' | 'partial';
export const SCENARIOS: Scenario[] = ['default', 'empty', 'working', 'blocked', 'error', 'partial'];
export const toScenario = (v: unknown): Scenario => (SCENARIOS.includes(v as Scenario) ? (v as Scenario) : 'default');

export type Evidence = {
  whyLabel: string;
  why: string;
  inputs: { label: string; ref: string; href: string }[];
  steps: string[];
  auditId: string;
};

export type Payee = {
  name: string;
  role: string;
  source: string;
  taxForm: string;
  taxState: 'ok' | 'expiring' | 'missing';
  withheld: Cents;
  net: Cents;
};

export type PayoutBody = {
  kind: 'payout';
  stats: { label: string; value: string }[];
  payees: Payee[];
  total: Cents;
  waterfall: { payee: string; amount: Cents; rows: WaterfallRow[]; totalLabel: string };
};

export type ContractFlag = { id: string; title: string; ref: string; draft: string; playbook: string; why: string };
export type ContractBody = {
  kind: 'contract';
  plain: [string, string][];
  flags: ContractFlag[];
  labelHeadNote: string;
  offTemplate: boolean;
  document: { page: string; blocks: ({ kind: 'heading'; text: string } | { kind: 'clause'; text: string; flagRef?: string })[]; footer: string };
};

export type FilingBody = {
  kind: 'filing';
  org: string;
  works: { title: string; writers: string; isrc: string; iswc: string }[];
  facts: string[];
};

export type ApplicationBody = {
  kind: 'application';
  to: string;
  ask: string;
  deadline: { date: string; verified: string; href: string };
  fields: { label: string; value: string; limit: number }[];
};

export type ApprovalDetail = ApprovalSummary & {
  breadcrumb: string;
  /** H1. `highlight` is the part shown in the accent color. */
  outcome: { text: string; highlight?: string };
  primaryLabel: string;
  rejectLabel: string;
  evidence: Evidence;
  body: PayoutBody | ContractBody | FilingBody | ApplicationBody;
};

export type FeedItem = { agent: string; state: AgentState; text: string; when: string };
export type Goal = { id: string; title: string; pct: number; meta: string; href?: string };
export type DateItem = { date: string; title: string; meta: string };

export type HomeData = {
  today: string;
  user: { name: string; initial: string };
  brief: string;
  numbers: NumberTile[];
  goals: Goal[];
  dates: DateItem[];
  feed: FeedItem[];
};

export type RunbookTask = { title: string; owner: string; state: TaskState; gate?: { owner: string; waitingOn?: string } };
/** `iso` is the phase date; phases after `now` move when the release date moves. `until` marks a range ("to Jun 3"). */
export type RunbookPhase = { name: string; iso: string; until?: boolean; status: 'done' | 'now' | 'future'; tasks: RunbookTask[] };
export type Release = {
  id: string;
  title: string;
  kind: string;
  artist: string;
  /** ISO release date. */
  date: string;
  status: 'onTrack' | 'atRisk' | 'blocked';
  budget: Cents;
  spent: Cents;
  phases: RunbookPhase[];
  assets: { name: string; kind: string; ready: boolean }[];
  registrations: { name: string; status: Status; term?: 'PRO' | 'MLC' | 'SoundExchange' }[];
  pitch: { text: string; limit: number };
  blockers: string[];
};
