'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { GateLock, RunbookTask } from '@/components/ui/Blocks';
import { ProgressBar, Term } from '@/components/ui/Controls';
import { RiskFlag, StatusPill } from '@/components/ui/Status';
import { cx } from '@/components/ui/cx';
import { useDecisions } from '@/data/decisions';
import type { Release } from '@/data/types';
import { addDays, daysBetween, long, short } from '@breakrecords/core/dates';
import { formatMoney } from '@breakrecords/core/money';
import s from './Runbook.module.css';

const STATUS = { onTrack: ['low', 'On track'], atRisk: ['dueSoon', 'At risk'], blocked: ['blocked', 'Blocked'] } as const;

export function RunbookView({ release: r, initialChange }: { release: Release; initialChange?: string }) {
  const { decisions, proposals, propose } = useDecisions();
  const planId = `plan_date_${r.id}`;
  const plan = proposals.find((p) => p.id === planId);
  // An approved date-change plan moves the release; until then the runbook keeps its date.
  const date = plan?.newDate && decisions[planId]?.status === 'approved' ? plan.newDate : r.date;
  const pendingPlan = plan && !decisions[planId] ? plan : null;

  const blockers = useRef<HTMLDialogElement>(null);
  const change = useRef<HTMLDialogElement>(null);
  const [newDate, setNewDate] = useState(initialChange ?? addDays(r.date, 14));
  const [copied, setCopied] = useState(false);
  // Arriving from a Plan approval's Review link reopens the change-date drawer.
  useEffect(() => { if (initialChange && !change.current?.open) change.current?.showModal(); }, [initialChange]);
  const shift = daysBetween(r.date, date);
  const delta = daysBetween(date, newDate);

  const phases = r.phases.map((p) => ({ ...p, iso: p.status === 'future' ? addDays(p.iso, shift) : p.iso }));
  const moving = phases.filter((p) => p.status === 'future');
  const spentPct = Math.round((r.spent / r.budget) * 100);
  const [risk, word] = STATUS[r.status];
  const assetsReady = r.assets.filter((a) => a.ready).length;

  const sendPlan = () => {
    propose({
      id: planId, type: 'plan', title: `Move Glasshouse to ${short(newDate)}`, agent: 'Label Head', due: short(addDays(newDate, -56)),
      impact: `${moving.reduce((n, p) => n + p.tasks.length, 0)} tasks move ${Math.abs(delta)} days`, risk: 'dueSoon',
      riskLabel: 'Plan change', context: 'Release runbook', href: `/releases/${r.id}?change=${newDate}`, releaseId: r.id, newDate,
    });
    change.current?.close();
  };

  return (
    <>
      <header className={s.header}>
        <div className={s.cover} role="img" aria-label="Cover art placeholder">cover art</div>
        <div className={s.titleBlock}>
          <nav aria-label="Breadcrumb" className={s.crumb}><Link href="/releases">Releases</Link> / {r.kind}</nav>
          <h1 className={s.title}>{r.title}</h1>
          <p className={s.facts}><span>{r.artist}</span><span>{long(date)}</span><RiskFlag risk={risk} label={word} strong /></p>
          <div className={s.budget}>
            <ProgressBar value={spentPct} label={`${formatMoney(r.spent, { wholeIfRound: true })} of ${formatMoney(r.budget, { wholeIfRound: true })} budget spent`} />
            <span className={s.budgetText} aria-hidden="true">{formatMoney(r.spent, { wholeIfRound: true })} of {formatMoney(r.budget, { wholeIfRound: true })}</span>
          </div>
        </div>
        <div className={s.headActions}>
          <Button onClick={() => change.current?.showModal()}>Change date</Button>
          <Button variant="primary" onClick={() => blockers.current?.showModal()}>What blocks delivery?</Button>
        </div>
      </header>

      <div className={s.body}>
        <section aria-label="Timeline">
          {pendingPlan && (
            <p className={s.note} role="status" style={{ marginBottom: 12 }}>
              A plan to move this release to {short(pendingPlan.newDate ?? r.date)} is waiting in <Link href="/approvals" style={{ color: 'var(--accent)' }}>Approvals</Link>. Dates below stay as they are until you approve it.
            </p>
          )}
          <ol className={s.timeline}>
            {phases.map((p) => (
              <li key={p.name} className={cx(s.phase, s[p.status])}>
                <div className={s.phaseHead}>
                  <h2 className={s.phaseName}>{p.name}</h2>
                  <p className={s.phaseDate}>{p.until ? `to ${short(p.iso)}` : short(p.iso)}</p>
                  {p.status === 'now' && <span className={s.here}>You are here</span>}
                </div>
                <ul className={s.tasks}>
                  {p.tasks.map((t) => t.gate
                    ? <GateLock key={t.title} title={t.title} owner={t.gate.owner} waitingOn={t.gate.waitingOn} met={t.state === 'done'} />
                    : <RunbookTask key={t.title} title={t.title} owner={t.owner} state={t.state} />)}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <aside className={s.side} aria-label="Release details">
          <section className={s.card} aria-labelledby="assets">
            <h2 id="assets" className={s.cardTitle}>Assets <span className={s.cardCount}>{assetsReady} of {r.assets.length}</span></h2>
            <ul className={s.assets}>
              {r.assets.map((a) => (
                <li key={a.name} className={s.asset}>
                  <div className={cx(s.thumb, !a.ready && s.thumbMissing)} aria-hidden="true">{a.kind}</div>
                  <p className={s.assetName}><span className={a.ready ? s.ok : s.bad} aria-hidden="true">{a.ready ? '✓' : '!'}</span> {a.name}<span className="visually-hidden">{a.ready ? ', ready' : ', missing'}</span></p>
                </li>
              ))}
            </ul>
          </section>
          <section className={s.card} aria-labelledby="regs">
            <h2 id="regs" className={s.cardTitle}>Registrations</h2>
            <ul>
              {r.registrations.map((g) => (
                <li key={g.name} className={s.reg}>
                  <span>{g.term ? <><Term term={g.term}>{g.name.split(' ')[0]}</Term>{g.name.includes(' ') ? ` ${g.name.split(' ').slice(1).join(' ')}` : ''}</> : g.name}</span>
                  <StatusPill status={g.status} />
                </li>
              ))}
            </ul>
          </section>
          <section className={s.pitch} aria-labelledby="pitch">
            <div className={s.pitchHead}><h2 id="pitch" className={s.cardTitle} style={{ margin: 0 }}>Playlist pitch draft</h2><span className={s.pitchCount}>{r.pitch.text.length} / {r.pitch.limit}</span></div>
            <p className={s.pitchText}>{r.pitch.text}</p>
            <div className={s.pitchActions}>
              <Button variant="primary" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(r.pitch.text); } catch { /* clipboard blocked */ } setCopied(true); }}>Copy for Spotify for Artists</Button>
              {copied && <span className={s.copied} role="status"><Check size={12} aria-hidden="true" style={{ display: 'inline' }} /> Copied</span>}
            </div>
          </section>
        </aside>
      </div>

      <dialog ref={blockers} className={s.drawer} aria-labelledby="blk" onClick={(e) => { if (e.target === blockers.current) blockers.current?.close(); }}>
        <div className={s.drawerHead}><h2 id="blk" className={s.drawerTitle}>What blocks delivery</h2><button type="button" className={s.iconBtn} aria-label="Close" onClick={() => blockers.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <p className={s.lh}>Delivery to the distributor is due {short(addDays(date, -28))}. {r.blockers.length} things stand in the way:</p>
        <ul className={s.blockers}>
          {r.blockers.map((b) => <li key={b} className={s.blocker}><Lock size={14} aria-hidden="true" style={{ color: 'var(--critical)', marginTop: 3 }} />{b}</li>)}
        </ul>
        <div className={s.drawerActions}><ButtonLink href="/approvals/apr_producer" variant="primary">Review the producer agreement</ButtonLink></div>
      </dialog>

      <dialog ref={change} className={s.drawer} aria-labelledby="chg" onClick={(e) => { if (e.target === change.current) change.current?.close(); }}>
        <div className={s.drawerHead}><h2 id="chg" className={s.drawerTitle}>Change release date</h2><button type="button" className={s.iconBtn} aria-label="Close" onClick={() => change.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <label className={s.field}>New release date<input type="date" className={s.input} value={newDate} min={addDays(r.date, -28)} onChange={(e) => e.target.value && setNewDate(e.target.value)} /></label>
        <p className={s.lh} aria-live="polite">
          {delta === 0 ? 'That is the current date. Pick another to see what moves.'
            : `Moving to ${long(newDate)} shifts ${moving.reduce((n, p) => n + p.tasks.length, 0)} tasks by ${Math.abs(delta)} days ${delta > 0 ? 'later' : 'earlier'}. The budget stays at ${formatMoney(r.budget, { wholeIfRound: true })}. I send this to you as a plan to approve; nothing changes until you do.`}
        </p>
        {delta !== 0 && (
          <ul className={s.diff} aria-label="What moves">
            {moving.map((p) => (
              <li key={p.name} className={s.diffRow}><span>{p.name}</span><span className={s.diffDates}><span className={s.old}>{short(p.iso)}</span>{short(addDays(p.iso, delta))}</span></li>
            ))}
          </ul>
        )}
        <div className={s.drawerActions}>
          <Button variant="primary" disabled={delta === 0} disabledReason="Pick a different date first." id="send-plan" onClick={sendPlan}>Send as a plan to approve</Button>
          <Button onClick={() => change.current?.close()}>Keep {short(date)}</Button>
        </div>
      </dialog>
    </>
  );
}

