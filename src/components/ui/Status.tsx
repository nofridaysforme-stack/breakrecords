import { ArrowUp, Check, CircleAlert, Circle, Diamond, Minus, Square, Triangle } from 'lucide-react';
import { cx } from './cx';
import s from './Status.module.css';

// ---------- Status pill: registrations and tasks (tokens.json > status) ----------
export type Status = 'notStarted' | 'prepared' | 'needsYou' | 'submitted' | 'confirmed' | 'blocked';

const STATUS: Record<Status, { label: string; Icon: typeof Check; fill?: boolean }> = {
  notStarted: { label: 'Not started', Icon: Minus },
  prepared: { label: 'Prepared', Icon: Circle },
  needsYou: { label: 'Needs you', Icon: CircleAlert },
  submitted: { label: 'Submitted', Icon: ArrowUp },
  confirmed: { label: 'Confirmed', Icon: Check },
  blocked: { label: 'Blocked', Icon: Square, fill: true },
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const { label: def, Icon, fill } = STATUS[status];
  return (
    <span className={cx(s.pill, s[status])}>
      <Icon size={12} strokeWidth={2.5} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
      {label ?? def}
    </span>
  );
}

// ---------- Risk flag: rotated square + word (approval cards, inbox rows, goals) ----------
export type Risk = 'low' | 'dueSoon' | 'needsEyes' | 'blocked';
const RISK: Record<Risk, string> = { low: 'Low risk', dueSoon: 'Due soon', needsEyes: 'Needs your eyes', blocked: 'Blocked' };

export function RiskFlag({ risk, label, eyebrow, strong }: { risk: Risk; label?: string; eyebrow?: boolean; strong?: boolean }) {
  const cls = risk === 'blocked' ? s.flagBlocked : s[risk];
  return (
    <span className={cx(s.flag, cls, eyebrow && s.flagEyebrow, strong && s.flagStrong)}>
      <span className={cx(s.diamond, !eyebrow && s.diamondLg)} aria-hidden="true" />
      {label ?? RISK[risk]}
    </span>
  );
}

// ---------- Task state flag (runbook 2g): diamond + word ----------
export type TaskState = 'done' | 'inProgress' | 'needsYou' | 'waiting' | 'locked';
const TASK: Record<TaskState, [string, string]> = {
  done: ['Done', s.done], inProgress: ['In progress', s.inProgress], needsYou: ['Needs you', s.needsEyes],
  waiting: ['Waiting', s.waiting], locked: ['Locked', s.needsEyes],
};
export function TaskFlag({ state, label: override }: { state: TaskState; label?: string }) {
  const [def, cls] = TASK[state];
  const label = override ?? def;
  return (
    <span className={cx(s.flag, cls)} style={{ fontSize: 'var(--fs-eyebrow-lg)' }}>
      <span className={s.diamond} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------- Agent chip: dot + "{Agent} · {state}" ----------
export type AgentState = 'idle' | 'working' | 'waitingOnYou' | 'blocked' | 'done';
const AGENT: Record<AgentState, [string, string]> = {
  idle: ['idle', ''], working: ['working', s.working], waitingOnYou: ['waiting on you', s.waitingOnYou],
  blocked: ['blocked', s.agentBlocked], done: ['done', s.agentDone],
};

/** `boxed` is the bordered chip from 3c; `task` replaces the state word ("importing October statements"). */
export function AgentChip({ agent, state, task, boxed }: { agent: string; state: AgentState; task?: string; boxed?: boolean }) {
  const [word, cls] = AGENT[state];
  return (
    <span className={cx(s.chip, cls, boxed && s.chipBoxed)}>
      <span className={s.dot} aria-hidden="true" />
      {agent} · {task ?? word}
    </span>
  );
}

/** Orange "Preparing" marker for cards an agent is still drafting (3d). */
export function Preparing({ label = 'Preparing' }: { label?: string }) {
  return (
    <span className={cx(s.chip, s.working, s.preparing)}>
      <span className={s.dot} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------- Approval type glyph: one shape per type (components.md) ----------
export type ApprovalType = 'money' | 'signature' | 'filing' | 'public' | 'plan';
const TYPE: Record<ApprovalType, { Icon: typeof Circle; fill: boolean; label: string }> = {
  money: { Icon: Circle, fill: true, label: 'Money' },
  signature: { Icon: Diamond, fill: true, label: 'Signature' },
  filing: { Icon: Square, fill: true, label: 'Filing' },
  public: { Icon: Diamond, fill: false, label: 'Public' },
  plan: { Icon: Triangle, fill: true, label: 'Plan' },
};
export const approvalTypeLabel = (t: ApprovalType) => TYPE[t].label;

export function TypeGlyph({ type, size = 8 }: { type: ApprovalType; size?: number }) {
  const { Icon, fill } = TYPE[type];
  return <Icon className={s.glyph} size={size} strokeWidth={fill ? 0 : 3} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />;
}
