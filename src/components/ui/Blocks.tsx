'use client';

import { Check, Circle, CircleAlert, Lock, Square } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Eyebrow } from '@/components/type/Type';
import { RiskFlag, TaskFlag, type TaskState } from './Status';
import { ProgressBar } from './Controls';
import { cx } from './cx';
import s from './Blocks.module.css';

// ---------------- Runbook task and gate lock (2g) ----------------

const TASK_ICON: Record<TaskState, { Icon: typeof Check; cls: string; fill?: boolean }> = {
  done: { Icon: Check, cls: s.iDone },
  inProgress: { Icon: Circle, cls: s.iProgress },
  needsYou: { Icon: CircleAlert, cls: s.iNeeds },
  waiting: { Icon: Circle, cls: s.iWaiting },
  locked: { Icon: Lock, cls: s.iLocked },
};

type TaskProps = { title: string; owner: string; state: TaskState };

export function RunbookTask({ title, owner, state }: TaskProps) {
  const { Icon, cls } = TASK_ICON[state];
  return (
    <li className={s.task}>
      <span className={s.taskTitle}><Icon className={cx(s.taskIcon, cls)} size={13} strokeWidth={2.5} aria-hidden="true" />{title}</span>
      <span className={s.taskOwner}>{owner}</span>
      <TaskFlag state={state} />
    </li>
  );
}

type GateProps = {
  title: string;
  /** "Legal" or "Distribution Agent". */
  owner: string;
  /** Who the owner is waiting on, if anyone. */
  waitingOn?: string;
  met: boolean;
};

/** A hard requirement on the runbook. Shows what unlocks it and who owns it. */
export function GateLock({ title, owner, waitingOn, met }: GateProps) {
  return (
    <li className={cx(s.task, s.gate, !met && s.gateLocked)}>
      <span className={s.taskTitle}>
        <Square className={cx(s.taskIcon, met ? s.iDone : s.iLocked)} size={10} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        Gate: {title}
      </span>
      <span className={s.taskOwner}>Owner: {owner}{waitingOn ? ` · waiting on ${waitingOn}` : ''}</span>
      <TaskFlag state={met ? 'done' : 'locked'} />
    </li>
  );
}

// ---------------- Verified stamp ----------------

/** Required on rates, grant deadlines and policies. */
export function VerifiedStamp({ date, href, what = 'Last verified' }: { date: string; href: string; what?: string }) {
  return <p className={s.stamp}>{what} {date} · <a href={href}>source</a></p>;
}

// ---------------- Evidence (2e) ----------------

type EvidenceProps = {
  why: { label: string; text: string };
  inputs: { label: string; ref: string; href: string }[];
  steps: string[];
  auditId: string;
  logHref: string;
  onClose?: () => void;
};

/** The 380px right panel on approval detail. Close returns focus to the trigger (handled by the drawer). */
export function EvidencePanel({ why, inputs, steps, auditId, logHref, onClose }: EvidenceProps) {
  return (
    <section className={s.evidence} aria-labelledby="evidence-title">
      <div className={s.evHead}>
        <h2 id="evidence-title" className={s.evTitle}>Evidence</h2>
        {onClose && <button type="button" className={s.linkBtn} onClick={onClose}>Close</button>}
      </div>
      <div className={s.evSection}>
        <h3 className={s.evLabel}>{why.label}</h3>
        <p className={s.evProse}>{why.text}</p>
      </div>
      <div className={s.evSection}>
        <h3 className={s.evLabel}>Inputs used</h3>
        <ul className={s.evSection}>
          {inputs.map((i) => <li key={i.ref} className={s.evInput}><span>{i.label}</span><a href={i.href}>{i.ref}</a></li>)}
        </ul>
      </div>
      <div className={s.evSection}>
        <h3 className={s.evLabel}>Steps the agent ran</h3>
        <ul className={s.evSection}>
          {steps.map((t) => <li key={t} className={s.evStep}><Check size={13} strokeWidth={3} aria-hidden="true" />{t}</li>)}
        </ul>
      </div>
      <p className={s.evFoot}>Audit ID {auditId} · <a href={logHref}>Open in log</a></p>
    </section>
  );
}

// ---------------- Goal box (3a) ----------------

type GoalProps = {
  examples?: string[];
  onSubmit: (goal: string) => void;
  placeholder?: string;
};

export function GoalBox({ examples = [], onSubmit, placeholder = 'Release a single March 6 on a $3,000 budget' }: GoalProps) {
  const [goal, setGoal] = useState('');
  return (
    <form className={s.goal} onSubmit={(e) => { e.preventDefault(); if (goal.trim()) onSubmit(goal.trim()); }}>
      <div className={s.goalBox}>
        <label htmlFor="goal" className="visually-hidden">Your goal</label>
        <input id="goal" className={s.goalInput} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={placeholder} autoComplete="off" />
        <Button type="submit" variant="primary">Draft a plan</Button>
      </div>
      {examples.length > 0 && (
        <div>
          <Eyebrow as="p">Or start from one of these</Eyebrow>
          <div className={s.chips} style={{ marginTop: 8 }}>
            {examples.map((ex) => <button key={ex} type="button" className={s.chip} onClick={() => setGoal(ex)}>{ex}</button>)}
          </div>
        </div>
      )}
    </form>
  );
}

// ---------------- Plan preview (undrawn: built from runbook parts) ----------------

export type PlanPhase = { name: string; date: string; tasks: { title: string; owner: string }[] };

type PlanProps = {
  goal: string;
  budget: string;
  dates: string;
  approvals: number;
  phases: PlanPhase[];
  onApprove: () => void;
  onChange?: () => void;
};

/** The Label Head's proposed plan. "Approve plan" routes to the inbox as a Plan approval. */
export function PlanPreview({ goal, budget, dates, approvals, phases, onApprove, onChange }: PlanProps) {
  return (
    <section className={s.plan} aria-labelledby="plan-title">
      <div className={s.planHead}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className={s.lhEyebrow} style={{ color: 'var(--text-muted)' }}><span className={s.square} aria-hidden="true" />Label Head · plan preview</span>
          <h2 id="plan-title" className={s.planTitle}>{goal}</h2>
          <p className={s.planFacts}><span>Budget {budget}</span><span>{dates}</span><span>{approvals} approvals along the way</span></p>
        </div>
        <div className={s.planActions}>
          {onChange && <Button onClick={onChange}>Change it</Button>}
          <Button variant="primary" onClick={onApprove}>Approve plan</Button>
        </div>
      </div>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phases.map((p) => (
          <li key={p.name} className={s.planPhase}>
            <div><div className={s.phaseName}>{p.name}</div><div className={s.phaseDate}>{p.date}</div></div>
            <ul className={s.planTasks}>
              {p.tasks.map((t) => <li key={t.title} className={s.planTask}><span>{t.title}</span><span className={s.planOwner}>{t.owner}</span></li>)}
            </ul>
          </li>
        ))}
      </ol>
      <p className={s.workingNote}>Nothing starts until you approve. Anything that moves money, signs, files or goes public still comes back to you.</p>
    </section>
  );
}

// ---------------- Market-range warning (4a) ----------------

/** Neutral, not red. What is common, where this sits, why it matters, verified. */
export function MarketRangeWarning({ children, verified }: { children: ReactNode; verified: { date: string; href: string } }) {
  return (
    <aside className={s.market} aria-label="Worth a look">
      <Eyebrow as="h3">◇ Worth a look</Eyebrow>
      <p className={s.marketText}>{children}</p>
      <VerifiedStamp what="Range last verified" date={verified.date} href={verified.href} />
    </aside>
  );
}

// ---------------- Label Head block ----------------

type LHProps = {
  /** After "LABEL HEAD · ". */
  eyebrow: string;
  heading?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Writing state (3c): skeleton bars instead of copy. */
  writing?: boolean;
};

/** Burgundy block. The Label Head speaks in first person. */
export function LabelHeadBlock({ eyebrow, heading, children, action, writing }: LHProps) {
  return (
    <section className={s.lh} aria-label={`Label Head, ${eyebrow}`} aria-busy={writing || undefined}>
      <div className={s.lhBody}>
        <p className={s.lhEyebrow}><span className={s.square} aria-hidden="true" />Label Head · {eyebrow}</p>
        {writing ? (
          <div className={s.lhSkeleton} aria-hidden="true"><div className={cx(s.lhBar, s.shimmer)} style={{ width: '78%' }} /><div className={cx(s.lhBar, s.shimmer)} style={{ width: '62%' }} /></div>
        ) : (
          <>
            {heading}
            {children && <div className={s.lhText}>{children}</div>}
          </>
        )}
      </div>
      {action}
    </section>
  );
}

// ---------------- State patterns (flows.md > States) ----------------

/** Empty: one sentence and one action (3b). */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty} role="status">
      <span className={s.emptyIcon} aria-hidden="true"><Check size={20} strokeWidth={3} /></span>
      <h2 className={s.emptyTitle}>{title}</h2>
      {children && <p className={s.emptyText}>{children}</p>}
      {action}
    </div>
  );
}

/** Loading: skeleton blocks on --surface, no spinners. */
export function Skeleton({ height, width = '100%', faded }: { height: number; width?: string | number; faded?: boolean }) {
  return <div className={cx(s.skeleton, s.shimmer)} style={{ height, width, opacity: faded ? 0.6 : undefined }} aria-hidden="true" />;
}

export function WorkingNote({ children }: { children: ReactNode }) {
  return <p className={s.workingNote} role="status">{children}</p>;
}

type NoticeProps = {
  heading: string;
  /** Must say whether money or filings were affected. */
  children: ReactNode;
  meta?: string;
  actions?: ReactNode;
};

/** Error (3g): what failed, what it affected, error and audit id, Retry. */
export function ErrorNotice({ heading, children, meta, actions }: NoticeProps) {
  return (
    <section className={s.notice} role="alert">
      <h2 className={s.noticeHead}><span className={s.noticeIcon} aria-hidden="true">!</span>{heading}</h2>
      <p className={s.noticeBody}>{children}</p>
      {meta && <p className={s.noticeMeta}>{meta}</p>}
      {actions && <div className={s.noticeActions}>{actions}</div>}
    </section>
  );
}

/** Partial data (3i, 3j): show what is known, label the gap, offer Connect. */
export function PartialNotice({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className={s.partial} role="note">
      <p className={s.partialText}>{children}</p>
      {action}
    </div>
  );
}

// ---------------- Goal card (2c) and blocked goal (3e) ----------------

type GoalCardProps = {
  title: string;
  pct: number;
  meta?: string;
  /** Blocked (3e): the reason names what is missing and who owns it. */
  blocked?: { reason: ReactNode; actions: ReactNode };
};

export function GoalCard({ title, pct, meta, blocked }: GoalCardProps) {
  return (
    <article className={cx(s.goalCard, blocked && s.goalBlocked)} aria-label={`${title}, ${pct}% of tasks done${blocked ? ', blocked' : ''}`}>
      <div className={s.goalTop}>
        <h3 className={s.goalTitle}>{title}</h3>
        {blocked ? <RiskFlag risk="blocked" strong /> : <span className={s.goalPct}>{pct}%</span>}
      </div>
      <ProgressBar value={pct} label={`${pct}% of tasks done`} />
      {blocked ? (
        <>
          <p className={s.goalReason}>{blocked.reason}</p>
          <div className={s.noticeActions}>{blocked.actions}</div>
        </>
      ) : meta && <p className={s.goalMeta}>{meta}</p>}
    </article>
  );
}

// ---------------- Numbers strip ----------------

export type NumberTile = {
  label: string;
  /** A formatted figure (use <Money>) or a word like "Stale". */
  value?: ReactNode;
  note?: string;
  /** Stale figure from an earlier period (3g). */
  stale?: boolean;
  /** Partial data (3i): no figure, a sentence about the gap instead. */
  gap?: string;
};

export function NumbersStrip({ tiles, label = 'Key numbers' }: { tiles: NumberTile[]; label?: string }) {
  return (
    <section className={s.numbers} style={{ ['--cols' as string]: tiles.length }} aria-label={label}>
      {tiles.map((t) => (
        <div key={t.label} className={s.num}>
          <h3 className={s.numLabel}>{t.label}</h3>
          {t.gap ? <p className={s.numGap}>{t.gap}</p> : <p className={cx(s.numValue, t.stale && s.numStale)}>{t.value}</p>}
          {t.note && <p className={s.numNote}>{t.note}</p>}
        </div>
      ))}
    </section>
  );
}
