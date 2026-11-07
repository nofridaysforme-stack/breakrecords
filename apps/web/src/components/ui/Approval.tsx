'use client';

import { Check, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from './Button';
import { Checkbox } from './Controls';
import { approvalTypeLabel, Preparing, RiskFlag, TypeGlyph, type ApprovalType, type Risk } from './Status';
import { cx } from './cx';
import s from './Approval.module.css';

/** What a card and an inbox row show. Defined by the API contract. */
export type { ApprovalSummary } from '@breakrecords/contract';
import type { ApprovalSummary } from '@breakrecords/contract';

/** Low-risk items may be bulk approved. Signatures never. */
export const canBulkApprove = (a: ApprovalSummary) => a.risk === 'low' && a.type !== 'signature';

const primaryLabel = (a: ApprovalSummary) => (a.type === 'signature' ? 'Review and sign' : 'Approve');

type CardProps = {
  approval: ApprovalSummary;
  reviewHref: string;
  onApprove?: (id: string) => void;
  /** Phone layout: "home" puts the due date in the eyebrow (2h), "inbox" after the impact (2i). */
  phone?: 'home' | 'inbox';
};

/** Default card (2c). Signature cards send you to the agreement instead of approving in place. */
export function ApprovalCard({ approval: a, reviewHref, onApprove, phone = 'home' }: CardProps) {
  const titleId = `apr-${a.id}-title`;
  const sig = a.type === 'signature';
  return (
    <article className={cx(s.card, phone === 'inbox' ? s.phoneInbox : s.phoneHome)} aria-labelledby={titleId}>
      <div className={s.eyebrowRow}>
        <span className={s.typeLabel}><TypeGlyph type={a.type} />{approvalTypeLabel(a.type)}<span className={s.eyebrowDue}> · {a.due}</span></span>
        <RiskFlag risk={a.risk} label={a.riskLabel} eyebrow />
      </div>
      <h3 id={titleId} className={s.title}>{a.title}</h3>
      <p className={s.meta}>{a.agent} · due {a.due}</p>
      <p className={s.impact}>{a.impact}<span className={s.impactDue}> · due {a.due}</span></p>
      <div className={s.actions}>
        {sig ? (
          <>
            {/* Signatures are never approved from a card: review the agreement first. */}
            <ButtonLink href={reviewHref} variant="primary">Review</ButtonLink>
            <ButtonLink href={`${reviewHref}?ask=1`} variant="secondary">Ask agent</ButtonLink>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => onApprove?.(a.id)}>{primaryLabel(a)}</Button>
            <ButtonLink href={reviewHref} variant="secondary">Review</ButtonLink>
          </>
        )}
      </div>
    </article>
  );
}

/** An agent is still drafting this one (3d). No Approve button until it is ready. */
export function ApprovalPreparing({ title, agent, eta, flag }: { title: string; agent: string; eta: string; flag?: ReactNode }) {
  return (
    <article className={s.preparing} aria-label={`${title}, ${flag ? 'draft' : 'preparing'}`} aria-busy={flag ? undefined : true}>
      <div>
        <h3 className={s.title}>{title}</h3>
        <p className={s.preparingMeta}>{agent} · {eta}</p>
      </div>
      {flag ?? <Preparing />}
    </article>
  );
}

type BlockedProps = {
  approval: Pick<ApprovalSummary, 'id' | 'type' | 'title' | 'due'>;
  /** What is missing and who owns it. May contain <strong>. */
  reason: ReactNode;
  fix: { label: string; onClick?: () => void };
  alternative?: { label: string; onClick?: () => void };
};

/** Blocked (3f): red border, what is missing, who owns it, one fix action. */
export function ApprovalBlocked({ approval: a, reason, fix, alternative }: BlockedProps) {
  const titleId = `apr-${a.id}-title`;
  return (
    <article className={cx(s.card, s.cardBlocked)} aria-labelledby={titleId}>
      <div className={s.eyebrowRow}>
        <span className={s.typeLabel}><TypeGlyph type={a.type} />{approvalTypeLabel(a.type)} · due {a.due}</span>
        <RiskFlag risk="blocked" eyebrow />
      </div>
      <h3 id={titleId} className={s.title}>{a.title}</h3>
      <p className={s.reason}>{reason}</p>
      <div className={s.fixActions}>
        <Button variant="primary" onClick={fix.onClick}>{fix.label}</Button>
        {alternative && <Button variant="secondary" onClick={alternative.onClick}>{alternative.label}</Button>}
      </div>
    </article>
  );
}

type FailedProps = {
  heading: string;
  /** Says what moved, what did not, and where the money is now. */
  body: ReactNode;
  fix: { label: string; onClick?: () => void };
  retry?: { label: string; onClick?: () => void };
};

/** Approved, then failed (3h). */
export function ApprovalFailed({ heading, body, fix, retry }: FailedProps) {
  return (
    <article className={cx(s.card, s.cardFailed)} role="alert">
      <div className={s.failHead}><span className={s.failIcon} aria-hidden="true">!</span>{heading}</div>
      <p className={s.failText}>{body}</p>
      <div className={s.fixActions}>
        <Button variant="primary" onClick={fix.onClick}>{fix.label}</Button>
        {retry && <Button variant="secondary" onClick={retry.onClick}>{retry.label}</Button>}
      </div>
    </article>
  );
}

/** After approving: a one-line confirmation and Undo for 5 seconds (flows.md > Motion). */
export function ApprovalConfirmed({ text, onUndo }: { text: string; onUndo?: () => void }) {
  return (
    <div className={s.confirm} role="status">
      <Check size={16} strokeWidth={3} aria-hidden="true" />
      {text}
      {onUndo && (
        <Button variant="ghost" className={s.undo} onClick={onUndo}>
          <Undo2 size={14} aria-hidden="true" />Undo
        </Button>
      )}
    </div>
  );
}

// ---------------- Inbox (2d) ----------------

type RowProps = {
  approval: ApprovalSummary;
  selected: boolean;
  onToggle: (id: string) => void;
  reviewHref: string;
  onApprove?: (id: string) => void;
};

export function ApprovalRow({ approval: a, selected, onToggle, reviewHref, onApprove }: RowProps) {
  const bulk = canBulkApprove(a);
  const titleId = `row-${a.id}-title`;
  const noBulkId = `row-${a.id}-nobulk`;
  const sig = a.type === 'signature';
  return (
    <article className={cx(s.row, selected && s.rowSelected)} aria-labelledby={titleId}>
      <Checkbox
        checked={selected}
        disabled={!bulk}
        onChange={() => onToggle(a.id)}
        aria-label={`Select ${a.title} for bulk approve`}
        aria-describedby={bulk ? undefined : noBulkId}
      />
      <div>
        <h3 id={titleId} className={s.rowTitle}>{a.title}</h3>
        <p className={s.rowMeta}>
          Prepared by {a.agent} · {sig ? `${a.context ?? ''}${a.context ? ' · ' : ''}signatures are never bulk-approved` : a.context}
        </p>
        {!bulk && (
          <span id={noBulkId} className="visually-hidden">
            {sig ? 'Signatures must be approved one at a time.' : 'Only low-risk items can be approved in bulk.'}
          </span>
        )}
      </div>
      <div className={s.rowFacts}>
        <p className={s.rowImpact}>{a.impact}</p>
        <p className={s.rowDue}><span className="visually-hidden">Due </span>{a.due}</p>
        <div><RiskFlag risk={a.risk} label={a.riskLabel} /></div>
      </div>
      <div className={s.rowActions}>
        <ButtonLink href={reviewHref} variant="secondary" size="sm">Review</ButtonLink>
        <Button
          variant="primary" size="sm"
          disabled={sig}
          disabledReason={sig ? 'Open the agreement to review and sign it.' : undefined}
          id={`row-${a.id}-approve`}
          onClick={() => onApprove?.(a.id)}
        >
          Approve
        </Button>
      </div>
    </article>
  );
}

export function ApprovalGroup({ type, count, emptyText, children }: { type: ApprovalType; count: number; emptyText?: string; children?: ReactNode }) {
  const headId = `grp-${type}`;
  return (
    <section className={s.group} aria-labelledby={headId}>
      <h2 id={headId} className={s.groupHead}><TypeGlyph type={type} />{approvalTypeLabel(type)} <span>· {count}</span></h2>
      {count === 0 && emptyText ? <p className={s.groupEmpty}>{emptyText}</p> : children}
    </section>
  );
}

type BulkProps = { count: number; summary: string; onClear: () => void; onApprove: () => void };

/** Shown when one or more low-risk rows are selected. */
export function BulkBar({ count, summary, onClear, onApprove }: BulkProps) {
  if (count === 0) return null;
  return (
    <div className={s.bulk} role="region" aria-label="Bulk approve">
      <span className={s.bulkBox} aria-hidden="true"><Check size={12} strokeWidth={3.5} /></span>
      <p className={s.bulkText} aria-live="polite">
        <strong>{count} low-risk {count === 1 ? 'item' : 'items'} selected</strong> <span>· {summary}</span>
      </p>
      <p className={s.bulkNote}>Signatures are always approved one at a time.</p>
      <Button size="sm" className={s.bulkClear} onClick={onClear}>Clear</Button>
      <Button variant="primary" size="sm" onClick={onApprove}>Approve {count}</Button>
    </div>
  );
}
