'use client';

import Link from 'next/link';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Eyebrow } from '@/components/type/Type';
import { useV5 } from '@/data/splitState';
import type { Payee, Statement } from '@/data/money';
import { formatMoney } from '@/lib/money';
import { withAs } from './payee';
import s from './Portal.module.css';

export function EarningsView({ p, statements }: { p: Payee; statements: Statement[] }) {
  const v5 = useV5();
  const latest = statements[0];
  const signed = v5.signedBy(p.id);
  const needsSign = v5.sent && !signed;
  const v5Status = (sp: Payee['splits'][number]) =>
    !v5.sent ? <span className={s.pendingDraft}>Draft, not sent to you yet</span>
      : signed ? <span className={s.signed}><Check size={12} aria-hidden="true" style={{ display: 'inline' }} /> signed v5</span>
        : <Link href={withAs('/portal/sign', p.id)} className={s.waiting}><Circle size={12} strokeWidth={2.5} aria-hidden="true" />{sp.note}</Link>;

  return (
    <>
      {/* ---------- desktop (4f) ---------- */}
      <div className={s.desk}>
        <h1 className={s.h1}>Hi {p.first}. Your next payment is <span className={s.accent}>{formatMoney(p.next.amount)}</span> on {p.next.date}.</h1>
        <dl className={s.stats}>
          <div className={s.stat}><dt className={s.statLabel}>Earned to date</dt><dd className={s.statValue}><Money cents={p.earned} /></dd></div>
          <div className={s.stat}><dt className={s.statLabel}>Paid so far</dt><dd className={s.statValue}><Money cents={p.paid} /></dd></div>
          <div className={s.stat}><dt className={s.statLabel}>Next payout</dt><dd className={s.statValue}>{p.next.date}</dd></div>
          <div className={s.stat}><dt className={s.statLabel}>Tax form</dt><dd className={s.taxOk}><Check size={16} strokeWidth={3} aria-hidden="true" />{p.tax.label}</dd></div>
        </dl>
        <div className={s.grid}>
          <section className={s.card} aria-labelledby="stmt">
            <div className={s.cardHead}><h2 id="stmt" className={s.cardTitle}>{latest.period.split(' ')[0]} statement</h2><button type="button" className={s.link} onClick={() => window.print()}>Download PDF</button></div>
            <dl className={s.lines}>{latest.simple.map((l) => <div key={l.label} style={{ display: 'contents' }}><dt>{l.label}</dt><dd><Money cents={l.amount} /></dd></div>)}</dl>
            <p className={s.total}><span>You receive</span><span><Money cents={latest.net} /></span></p>
            <Link href={withAs(`/portal/statements/${latest.id}`, p.id)} className={s.link}>See every line</Link>
          </section>
          <section className={s.card} aria-labelledby="splits">
            <h2 id="splits" className={s.cardTitle}>Splits you&apos;re part of</h2>
            <ul>
              {p.splits.map((sp) => (
                <li key={sp.title + sp.meta} className={s.split}>
                  <span><strong>{sp.title}</strong> <span className={s.splitMeta}>· {sp.meta}</span></span>
                  {sp.v5 ? v5Status(sp) : <span className={s.signed}>{sp.terms} · <Check size={12} aria-hidden="true" style={{ display: 'inline' }} /> {sp.note}</span>}
                </li>
              ))}
            </ul>
            <div><ButtonLink href={withAs('/portal/profile', p.id)}>Update bank details</ButtonLink></div>
          </section>
        </div>
      </div>

      {/* ---------- phone (4g) ---------- */}
      <div className={s.phone}>
        <h1 className="visually-hidden">Earnings</h1>
        <section className={s.next} aria-label="Next payment">
          <p className={s.nextLabel}>Next payment · {p.next.date}</p>
          <p className={s.nextAmount}><Money cents={p.next.amount} /></p>
          <p className={s.nextFrom}>{p.next.from}</p>
        </section>
        <div className={s.tiles}>
          <div className={s.tile}><span className={s.statLabel}>Earned to date</span><span className={s.tileValue}><Money cents={p.earned} /></span></div>
          <div className={s.tile}><span className={s.statLabel}>Tax form</span><span className={s.taxOk} style={{ fontSize: 'var(--fs-body-lg)', margin: 0 }}><Check size={14} strokeWidth={3} aria-hidden="true" />{p.tax.label}</span></div>
        </div>
        {needsSign && (
          <section className={s.prompt} aria-labelledby="sign">
            <h2 id="sign" className={s.promptTitle}>{p.signPrompt.title}</h2>
            <p className={s.promptText}>{p.signPrompt.text}</p>
            <ButtonLink href={withAs('/portal/sign', p.id)} variant="primary" mobileFull>Review and sign</ButtonLink>
          </section>
        )}
        <section aria-labelledby="stmts">
          <Eyebrow as="h2" id="stmts" className={s.statLabel}>Statements</Eyebrow>
          <ul className={s.list} style={{ marginTop: 8 }}>
            {statements.map((st) => (
              <li key={st.id}><Link href={withAs(`/portal/statements/${st.id}`, p.id)} className={s.listRow}><span>{st.period}</span><span className={s.listAmount}><Money cents={st.net} /><ChevronRight size={14} aria-hidden="true" /></span></Link></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
