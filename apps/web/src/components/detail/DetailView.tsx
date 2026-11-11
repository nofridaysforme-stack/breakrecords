'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, PanelRight, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ApprovalConfirmed } from '@/components/ui/Approval';
import { Checkbox } from '@/components/ui/Controls';
import { EvidencePanel, VerifiedStamp } from '@/components/ui/Blocks';
import { Money, Waterfall } from '@/components/ui/Money';
import { approvalTypeLabel, RiskFlag, TypeGlyph } from '@/components/ui/Status';
import { Eyebrow } from '@/components/type/Type';
import { cx } from '@/components/ui/cx';
import { useDecisions } from '@/data/decisions';
import { ChecksPanel } from './ChecksPanel';
import type { ApplicationBody, ApprovalDetail, ContractBody, FilingBody, PayoutBody } from '@/data/types';
import { formatMoney } from '@breakrecords/core/money';
import s from './Detail.module.css';

type Props = { detail: ApprovalDetail; next: { id: string; title: string } | null };

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function DetailView({ detail: d, next }: Props) {
  const { decisions, approve, reject, undo, checks } = useDecisions();
  const decision = decisions[d.id];
  const mine = checks?.[d.id];
  const [accepting, setAccepting] = useState(false);
  const [acceptReason, setAcceptReason] = useState('');
  const [acceptError, setAcceptError] = useState(false);
  const acceptRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(d.body.kind === 'payout');
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [facts, setFacts] = useState<boolean[]>(d.body.kind === 'filing' ? d.body.facts.map(() => false) : []);
  const [choices, setChoices] = useState<Record<string, 'playbook' | 'drafted'>>({});
  const drawer = useRef<HTMLDialogElement>(null);
  const evidenceBtn = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLDialogElement>(null);
  const [asked, setAsked] = useState<string | null>(null);

  // ----- what can be approved right now -----
  let blockReason: string | null = null;
  let primary = d.primaryLabel;
  // The precondition engine: a failed Block check keeps Approve off, whatever else is true.
  const failed = mine?.results.filter((r) => r.status === 'fail' && r.severity === 'block').length ?? 0;
  if (mine && !mine.canApprove) blockReason = `Can’t approve yet: ${failed} ${failed === 1 ? 'check' : 'checks'} failed. See Checks.`;
  else if (d.body.kind === 'filing' && facts.some((f) => !f)) blockReason = `Confirm all ${facts.length} facts to file.`;
  // 2f keeps Approve enabled; any term you haven't decided goes out as drafted, and we say so.
  const undecided = d.body.kind === 'contract' ? d.body.flags.filter((f) => !choices[f.id]).length : 0;
  if (d.body.kind === 'payout') {
    const body = d.body;
    const total = body.payees.filter((p) => !held.has(p.name)).reduce((a, p) => a + p.net, 0);
    if (held.size) primary = `Approve and send ${formatMoney(total)}`;
    if (!blockReason && held.size === body.payees.length) blockReason = 'Every payee is on hold. Release at least one to send.';
  }

  const needsReason = Boolean(mine?.needsReason);
  const doApprove = useCallback(() => {
    if (blockReason || decision) return;
    // Failed Warn checks: approving needs a typed reason, kept in the activity log.
    if (needsReason) { setAccepting(true); setTimeout(() => acceptRef.current?.focus(), 0); return; }
    approve([d.id]);
  }, [blockReason, decision, needsReason, approve, d.id]);
  const submitAccept = () => {
    if (!acceptReason.trim()) { setAcceptError(true); acceptRef.current?.focus(); return; }
    approve([d.id], acceptReason); setAccepting(false);
  };
  const openReject = useCallback(() => { setRejecting(true); setTimeout(() => reasonRef.current?.focus(), 0); }, []);
  const submitReject = () => {
    if (!reason.trim()) { setReasonError(true); reasonRef.current?.focus(); return; }
    reject(d.id, reason); setRejecting(false);
  };

  // Shortcuts from accessibility.md: A approve, E edit, R reject (asks for a reason), Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { setRejecting(false); setAccepting(false); return; }
      if (isTyping(e.target) || decision) return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); doApprove(); }
      else if (k === 'e') { e.preventDefault(); setMode((m) => (m === 'edit' ? 'view' : 'edit')); }
      else if (k === 'r') { e.preventDefault(); openReject(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doApprove, openReject, decision]);

  const showEvidence = () => {
    if (window.matchMedia('(min-width: 1360px)').matches && d.body.kind === 'payout') setEvidenceOpen(true);
    else drawer.current?.showModal();
  };

  const evidence = (onClose?: () => void) => (
    <EvidencePanel why={{ label: d.evidence.whyLabel, text: d.evidence.why }} inputs={d.evidence.inputs} steps={d.evidence.steps} auditId={d.evidence.auditId} logHref="/activity" onClose={onClose} />
  );

  const evidenceButton = (
    <Button ref={evidenceBtn} variant="ghost" size="sm" onClick={showEvidence} className={cx(d.body.kind === 'payout' && evidenceOpen && s.hideWide)}>
      <PanelRight size={14} aria-hidden="true" />Show evidence
    </Button>
  );

  // ----- header -----
  const outcome = d.outcome.highlight
    ? (() => { const [a, b] = d.outcome.text.split(d.outcome.highlight!); return <>{a}<span className={s.hl}>{d.outcome.highlight}</span>{b}</>; })()
    : d.outcome.text;
  const head = (
    <>
      <div className={s.crumbRow}>
        <nav aria-label="Breadcrumb" className={s.crumb}><Link href="/approvals">Approvals</Link> / {d.breadcrumb}</nav>
        {evidenceButton}
      </div>
      <div className={s.headBlock}>
        <p className={s.eyebrow}>
          <span><TypeGlyph type={d.type} />{approvalTypeLabel(d.type)}</span>
          <span>· {d.agent}</span>
          <span>· due {d.due}</span>
          <RiskFlag risk={d.risk} label={d.riskLabel} eyebrow />
        </p>
        <h1 className={s.outcome}>{outcome}</h1>
      </div>
    </>
  );

  // ----- action bar or decision -----
  const actions = decision ? (
    <div className={s.actions} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <ApprovalConfirmed
        text={decision.status === 'approved' ? `Approved. Nothing is sent before ${d.due}.` : `Rejected: "${decision.reason}". ${d.agent} will revise it.`}
        onUndo={() => undo([d.id])}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <ButtonLink href="/approvals">Back to approvals</ButtonLink>
        {next && <ButtonLink href={`/approvals/${next.id}`} variant="primary">Next: {next.title}</ButtonLink>}
      </div>
    </div>
  ) : accepting ? (
    <form className={s.rejectForm} onSubmit={(e) => { e.preventDefault(); submitAccept(); }} aria-label="Accept warnings with a reason">
      <label className={s.label} htmlFor="accept-reason">Why are you approving despite the {mine?.results.filter((r) => r.status === 'fail' && r.severity === 'warn').map((r) => r.id).join(', ')} warning? It’s kept with your decision.</label>
      <textarea
        id="accept-reason" ref={acceptRef} className={s.textarea} value={acceptReason}
        onChange={(e) => { setAcceptReason(e.target.value); setAcceptError(false); }}
        aria-invalid={acceptError} aria-describedby={acceptError ? 'accept-error' : undefined}
      />
      {acceptError && <p id="accept-error" className={s.error} role="alert">! A reason is required to accept a warning.</p>}
      <div className={s.rejectRow}>
        <Button type="submit" variant="primary" size="lg" style={{ marginLeft: 0 }}>{primary}</Button>
        <Button size="lg" onClick={() => { setAccepting(false); setAcceptError(false); }}>Cancel</Button>
      </div>
    </form>
  ) : rejecting ? (
    <form className={s.rejectForm} onSubmit={(e) => { e.preventDefault(); submitReject(); }} aria-label="Reject with reason">
      <label className={s.label} htmlFor="reason">Why are you rejecting this? {d.agent} uses your reason to redo it.</label>
      <textarea
        id="reason" ref={reasonRef} className={s.textarea} value={reason}
        onChange={(e) => { setReason(e.target.value); setReasonError(false); }}
        aria-invalid={reasonError} aria-describedby={reasonError ? 'reason-error' : undefined}
        placeholder="For example: hold this until Rue's W-9 is renewed"
      />
      {reasonError && <p id="reason-error" className={s.error} role="alert">! A reason is required to reject.</p>}
      <div className={s.rejectRow}>
        <Button type="submit" variant="destructive" size="lg" style={{ marginLeft: 0 }}>Reject</Button>
        <Button size="lg" onClick={() => { setRejecting(false); setReasonError(false); }}>Cancel</Button>
      </div>
    </form>
  ) : (
    <div className={s.actions}>
      <Button variant="primary" size="lg" onClick={doApprove} disabled={Boolean(blockReason)} disabledReason={blockReason ?? undefined} id="approve" aria-keyshortcuts="A">{primary}</Button>
      <Button size="lg" aria-pressed={mode === 'edit'} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} aria-keyshortcuts="E">{mode === 'edit' ? 'Done editing' : 'Edit then approve'}</Button>
      <Button size="lg" onClick={() => askRef.current?.showModal()}>Ask the agent</Button>
      <Button variant="destructive" size="lg" onClick={openReject} aria-keyshortcuts="R">{d.rejectLabel}</Button>
      {blockReason && <p className={s.kbdHint} style={{ color: 'var(--text-2)' }}>{blockReason}</p>}
      {undecided > 0 && <p className={s.kbdHint} style={{ color: 'var(--text-2)' }}>{undecided === 1 ? '1 flagged term is' : `${undecided} flagged terms are`} still as drafted. Approving sends {undecided === 1 ? 'it' : 'them'} that way.</p>}
      <p className="visually-hidden">Keyboard shortcuts: A approve, E edit, R reject with a reason, Escape closes.</p>
    </div>
  );

  const editNote = mode === 'edit' && !decision && (
    <p className={s.editNote} role="status">
      {d.body.kind === 'payout' ? 'Editing. Hold any payee to carry their amount to next period, then approve the rest.'
        : d.body.kind === 'application' ? 'Editing. Change the answers below; I keep your wording.'
        : 'Editing. Your changes become a new version for you to approve.'}
    </p>
  );


  const shared = (
    <>
      <dialog ref={drawer} className={s.drawer} aria-label="Evidence" onClick={(e) => { if (e.target === drawer.current) drawer.current?.close(); }}>
        {evidence(() => drawer.current?.close())}
      </dialog>
      <dialog ref={askRef} className={s.drawer} aria-labelledby="ask-title" onClick={(e) => { if (e.target === askRef.current) askRef.current?.close(); }}>
        <form style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); if (q) setAsked(String(q)); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="ask-title" className={s.flagsHead}>Ask {d.agent}</h2>
            <button type="button" className={s.iconBtn} aria-label="Close" onClick={() => askRef.current?.close()}><X size={16} aria-hidden="true" /></button>
          </div>
          {asked ? (
            <p className={s.hint} role="status"><Check size={14} aria-hidden="true" style={{ display: 'inline', color: 'var(--good)' }} /> Sent: &quot;{asked}&quot;. {d.agent} replies in the activity log. Nothing changes until you decide.</p>
          ) : (
            <>
              <label className={s.label} htmlFor="q">Your question</label>
              <textarea id="q" name="q" className={s.textarea} placeholder={d.body.kind === 'payout' ? 'Why is Rue Sato’s form flagged?' : 'What would you change?'} />
              <Button type="submit" variant="primary">Send question</Button>
            </>
          )}
        </form>
      </dialog>
    </>
  );

  // ---------------- contract layout (2f) ----------------
  if (d.body.kind === 'contract') {
    const body = d.body;
    return (
      <div className={s.contract}>
        <div className={s.col}>
          {head}
          {body.offTemplate && (
            <div className={s.attorney} role="note"><RiskFlag risk="needsEyes" label="Attorney review recommended" strong /> This isn&apos;t on your template, so I can&apos;t compare every clause to your playbook.</div>
          )}
          <section className={s.plain} aria-labelledby="plain">
            <Eyebrow as="h2" id="plain">In plain words</Eyebrow>
            <dl className={s.plainGrid}>{body.plain.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
          <ContractFlags body={body} choices={choices} setChoices={setChoices} />
          {mine && <ChecksPanel results={mine.results} />}
          {editNote}
          {actions}
        </div>
        <aside className={s.side2} aria-label="Agreement">
          <div className={s.lhNote}><p className={s.lhLabel}>Label Head</p><p className={s.lhText}>{body.labelHeadNote}</p></div>
          <article className={s.sheet} aria-label="Full document">
            <p className={s.sheetMeta}>FULL DOCUMENT · {body.document.page}</p>
            {body.document.blocks.map((b, i) => b.kind === 'heading'
              ? <h3 key={i} className={s.sheetHead}>{b.text}</h3>
              : <p key={i} className={cx(b.flagRef && s.sheetFlag)}>{b.flagRef && <span className="visually-hidden">Flagged: </span>}{b.text}</p>)}
            <p className={s.sheetFoot}>{body.document.footer} · <a href="#download">Download PDF</a></p>
          </article>
        </aside>
        {shared}
      </div>
    );
  }

  // ---------------- payout (2e), filing and application ----------------
  return (
    <div className={cx(s.layout, !(d.body.kind === 'payout' && evidenceOpen) && s.layoutNoRail)}>
      <div className={s.main}>
        {head}
        {d.body.kind === 'payout' && <PayoutBodyView body={d.body} editing={mode === 'edit' && !decision} held={held} setHeld={setHeld} />}
        {d.body.kind === 'filing' && <FilingBodyView body={d.body} facts={facts} setFacts={setFacts} locked={Boolean(decision)} />}
        {d.body.kind === 'application' && <ApplicationBodyView body={d.body} editing={mode === 'edit' && !decision} />}
        {mine && <ChecksPanel results={mine.results} />}
        {editNote}
        {actions}
      </div>
      {d.body.kind === 'payout' && evidenceOpen && (
        <aside className={s.rail} aria-label="Evidence">
          <div className={s.railInner}>{evidence(() => { setEvidenceOpen(false); setTimeout(() => evidenceBtn.current?.focus(), 0); })}</div>
        </aside>
      )}
      {shared}
    </div>
  );
}

// ---------------- bodies ----------------

function PayoutBodyView({ body, editing, held, setHeld }: { body: PayoutBody; editing: boolean; held: Set<string>; setHeld: (s: Set<string>) => void }) {
  const total = body.payees.filter((p) => !held.has(p.name)).reduce((a, p) => a + p.net, 0);
  const live = body.payees.length - held.size;
  return (
    <>
      <dl className={s.stats}>
        {body.stats.map((st) => <div key={st.label} className={s.stat}><dt className={s.statLabel}>{st.label}</dt><dd className={s.statValue} style={{ margin: 0 }}>{st.label === 'Payees' ? String(live) : st.value}</dd></div>)}
      </dl>
      <div className={s.tableWrap} role="region" aria-label="Payees in this batch" tabIndex={0}>
        <table className={s.table}>
          <caption className="visually-hidden">Payees in this batch</caption>
          <thead><tr>
            {editing && <th scope="col">Hold</th>}
            <th scope="col">Payee</th><th scope="col">Source</th><th scope="col">Tax form</th><th scope="col" className={s.r}>Withheld</th><th scope="col" className={s.r}>Net</th>
          </tr></thead>
          <tbody>
            {body.payees.map((p) => (
              <tr key={p.name} className={cx(held.has(p.name) && s.held)}>
                {editing && <td><Checkbox checked={held.has(p.name)} onChange={() => { const n = new Set(held); if (n.has(p.name)) n.delete(p.name); else n.add(p.name); setHeld(n); }} aria-label={`Hold ${p.name}`} /></td>}
                <th scope="row"><div className={s.payeeName}>{p.name}</div><div className={s.payeeRole}>{p.role}</div></th>
                <td className={s.source}>{p.source}</td>
                <td><RiskFlag risk={p.taxState === 'ok' ? 'low' : p.taxState === 'expiring' ? 'dueSoon' : 'blocked'} label={p.taxForm} /></td>
                <td className={cx(s.r, s.mono, s.muted)}><Money cents={p.withheld} /></td>
                <td className={cx(s.r, s.net)}>{held.has(p.name) ? <span>Held</span> : <Money cents={p.net} />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className={s.totalRow}>
            <th scope="row" colSpan={editing ? 5 : 4}>Total to {live} {live === 1 ? 'payee' : 'payees'}</th>
            <td className={cx(s.r, s.mono)}><Money cents={total} /></td>
          </tr></tfoot>
        </table>
      </div>
      <p className={s.hint}>
        Every amount opens its waterfall.{' '}
        <Popover.Root>
          <Popover.Trigger className={s.wfLink}>See how {body.waterfall.payee}&apos;s {formatMoney(body.waterfall.amount)} was calculated</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className={s.popover} sideOffset={8} align="start" aria-label={`How ${body.waterfall.payee}'s amount was calculated`}>
              <div className={s.popHead}><span>{body.waterfall.payee} · Glasshouse · October</span><Popover.Close className={s.iconBtn} aria-label="Close"><X size={16} aria-hidden="true" /></Popover.Close></div>
              <Waterfall rows={body.waterfall.rows} totalLabel={body.waterfall.totalLabel} compact />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </p>
    </>
  );
}

function ContractFlags({ body, choices, setChoices }: { body: ContractBody; choices: Record<string, 'playbook' | 'drafted'>; setChoices: (c: Record<string, 'playbook' | 'drafted'>) => void }) {
  return (
    <section className={s.col} style={{ gap: 12 }} aria-labelledby="flags">
      <h2 id="flags" className={s.flagsHead}>{body.flags.length} terms differ from your playbook</h2>
      {body.flags.map((f) => {
        const c = choices[f.id];
        return (
          <article key={f.id} className={cx(s.flag, c && s.flagResolved)} aria-labelledby={`flag-${f.id}`}>
            <div className={s.flagTop}>
              <h3 id={`flag-${f.id}`} className={s.flagTitle}>{f.title}</h3>
              {c ? <RiskFlag risk="low" label={c === 'playbook' ? 'Using playbook wording' : 'Accepted as drafted'} /> : <RiskFlag risk="needsEyes" label="Differs from playbook" />}
            </div>
            <div className={s.compare}>
              <div className={s.side}><p className={s.sideLabel}>This draft · {f.ref}</p><p className={s.sideText}>{f.draft}</p></div>
              <div className={s.side}><p className={s.sideLabel}>Your playbook</p><p className={s.sideText}>{f.playbook}</p></div>
            </div>
            <p className={s.why}><strong>Why it matters.</strong> {f.why}</p>
            <div className={s.choices} role="group" aria-label={`Decide on ${f.ref}`}>
              <button type="button" className={s.choice} aria-pressed={c === 'playbook'} onClick={() => setChoices({ ...choices, [f.id]: 'playbook' })}>Use playbook wording</button>
              <button type="button" className={s.choice} aria-pressed={c === 'drafted'} onClick={() => setChoices({ ...choices, [f.id]: 'drafted' })}>Accept as drafted</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function FilingBodyView({ body, facts, setFacts, locked }: { body: FilingBody; facts: boolean[]; setFacts: (f: boolean[]) => void; locked: boolean }) {
  return (
    <>
      <div className={s.tableWrap} role="region" aria-label={`${body.org} registration preview`} tabIndex={0}>
        <table className={s.table}>
          <caption className="visually-hidden">{body.org} registration preview</caption>
          <thead><tr><th scope="col">Song (composition)</th><th scope="col">Writers and shares</th><th scope="col">Linked recording (ISRC)</th><th scope="col">ISWC</th></tr></thead>
          <tbody>{body.works.map((w) => (
            <tr key={w.title}><th scope="row" className={s.payeeName}>{w.title}</th><td>{w.writers}</td><td className={s.mono}>{w.isrc}</td><td className={s.muted}>{w.iswc}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <fieldset className={s.facts}>
        <legend>Confirm these facts</legend>
        <p className={s.hint}>The {body.org} relies on what you state here. I can&apos;t check these for you.</p>
        {body.facts.map((f, i) => (
          <label key={f} className={s.fact}>
            <Checkbox checked={facts[i]} disabled={locked} onChange={() => setFacts(facts.map((v, j) => (j === i ? !v : v)))} />
            <span>{f}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

function ApplicationBodyView({ body, editing }: { body: ApplicationBody; editing: boolean }) {
  const [values, setValues] = useState(body.fields.map((f) => f.value));
  return (
    <>
      <p className={s.meta}><span>To: <strong>{body.to}</strong></span><span>Ask: <strong>{body.ask}</strong></span><span>Deadline: <strong>{body.deadline.date}</strong></span></p>
      <VerifiedStamp what="Deadline last verified" date={body.deadline.verified} href={body.deadline.href} />
      {body.fields.map((f, i) => (
        <div key={f.label} className={s.field}>
          <label className={s.label} htmlFor={`field-${i}`}>{f.label}</label>
          <textarea
            id={`field-${i}`} className={s.textarea} value={values[i]} readOnly={!editing} maxLength={f.limit} rows={5}
            onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
            aria-describedby={`count-${i}`}
          />
          <p id={`count-${i}`} className={s.count}>{values[i].length.toLocaleString('en-US')} of {f.limit.toLocaleString('en-US')} characters{editing ? '' : ' · press Edit then approve to change'}</p>
        </div>
      ))}
    </>
  );
}

