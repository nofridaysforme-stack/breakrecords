'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, CircleAlert, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDecisions } from '@/data/decisions';
import { advance, baselineIncome, sale, type AdvanceOffer, type OfferAssumptions, type SaleOffer } from '@/lib/offers';
import { formatMoney, toCents } from '@/lib/money';
import o from '@/components/ops/Ops.module.css';
import s from './Funding.module.css';

type Props = {
  assumptions: OfferAssumptions;
  advanceOffer: AdvanceOffer;
  saleOffer: SaleOffer;
  terms: { advance: { received: string; open: string; buyBack: string }; sale: { received: string; open: string; buyBack: string } };
};

/** Projections are estimates, so they show whole dollars. */
const usd = (c: number) => formatMoney(Math.round(c / 100) * 100, { wholeIfRound: true });
/** "About" figures: two significant digits, so $960 stays $960 and $12,000 stays $12,000. */
const about = (c: number) => '$' + Number((c / 100).toPrecision(2)).toLocaleString('en-US');
const pct = (bp: number) => `${Math.round(bp / 100)}%`;
const ACCEPT_ID = 'offer_advance_accept';

/** 5e (desktop) and 5j (phone). Every figure is worked out from the assumptions, which you can change. */
export function OfferCompare({ assumptions: initial, advanceOffer, saleOffer, terms }: Props) {
  const [a, setA] = useState(initial);
  const [form, setForm] = useState({ income: String(initial.annualIncome / 100), growth: String(initial.growthBp / 100) });
  const r = useMemo(() => ({ base: baselineIncome(a), adv: advance(a, advanceOffer), sale: sale(a, saleOffer) }), [a, advanceOffer, saleOffer]);
  const { propose, proposals, decisions } = useDecisions();
  const accepted = proposals.some((p) => p.id === ACCEPT_ID);
  const decision = decisions[ACCEPT_ID]?.status;
  const [declined, setDeclined] = useState(false);
  const [asked, setAsked] = useState(false);
  const ask = useRef<HTMLDialogElement>(null);
  const [question, setQuestion] = useState('');
  const years = a.years;
  const flat = a.growthBp === 0;

  const accept = () => propose({
    id: ACCEPT_ID, type: 'money', title: `Accept ${usd(advanceOffer.cash)} royalty advance`, agent: 'Finance Agent', due: terms.advance.open,
    impact: `${usd(advanceOffer.cash)} now · ${usd(advanceOffer.repayTotal)} repaid`, risk: 'needsEyes', context: 'Funding offer',
    href: '/funding/offers/compare', artists: ['Kesi Vale', 'The Low Hours'], releases: [], dept: 'Funding',
  });

  const applyAssumptions = (e: React.FormEvent) => {
    e.preventDefault();
    const income = Number(form.income); const growth = Number(form.growth);
    if (!(income >= 0) || !Number.isFinite(growth) || growth <= -100) return;
    setA({ ...a, annualIncome: toCents(income), growthBp: Math.round(growth * 100) });
  };

  const rows: { label: string; cells: [ReactNode, ReactNode, ReactNode]; big?: boolean; saleRed?: boolean; mono?: boolean }[] = [
    { label: 'Cash now', cells: ['$0', usd(advanceOffer.cash), usd(saleOffer.cash)], big: true },
    { label: 'You give up', cells: ['Nothing', `${pct(advanceOffer.shareBp)} of streaming income until ${usd(advanceOffer.repayTotal)} is repaid`, `${pct(saleOffer.shareBp)} of ${saleOffer.album} album income, forever`] },
    { label: 'Term', cells: ['n/a', `About ${r.adv.months} months`, 'Permanent'], saleRed: true },
    { label: 'Buy-back', cells: ['n/a', terms.advance.buyBack, terms.sale.buyBack] },
    { label: 'Effective yearly cost', cells: [<span key="b" className={s.money}>$0</span>, `About ${pct(r.adv.yearlyCostBp)}`, `About ${pct(r.sale.yearlyCostBp)} a year, forever`] },
    { label: `Your income, next ${years} years`, cells: [usd(r.base), usd(r.adv.income), `${usd(r.sale.income)} + ${usd(saleOffer.cash)} now`], mono: true },
    { label: `Cost over ${years} years`, cells: ['$0', usd(r.adv.cost), `${usd(r.sale.cost)} and continuing`], big: true, saleRed: true },
  ];

  const decided = (
    <>
      {accepted && (
        <p className={s.done} role="status">
          <Check size={16} className={o.good} aria-hidden="true" />
          {decision === 'approved' ? <>Advance approved. Finance Agent sends the signed acceptance next.</> : decision === 'rejected' ? <>You rejected accepting the advance.</> : <>Accepting the advance is waiting in <Link href="/approvals" className={o.linkInline}>Approvals</Link>. Nothing is signed until you approve it there.</>}
        </p>
      )}
      {declined && (
        <p className={s.done} role="status">
          Sale declined. Finance Agent will draft a short reply for you to send.
          <button type="button" className={o.linkInline} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--tap-min)' }} onClick={() => setDeclined(false)}><Undo2 size={14} aria-hidden="true" />Undo</button>
        </p>
      )}
      {asked && <p className={s.done} role="status"><Check size={16} className={o.good} aria-hidden="true" />Saved. Finance Agent drafts the email to each offerer and shows it to you before anything is sent.</p>}
    </>
  );

  const acceptBtn = (label: string, mobile?: boolean) => (
    <Button variant="primary" size={mobile ? undefined : 'lg'} onClick={accept} disabled={accepted && decision !== 'rejected'} disabledReason="Already sent to Approvals.">{label}</Button>
  );

  return (
    <>
      <div className={`${s.compare} ${s.desk}`}>
        <p className={o.crumb}><Link href="/funding">Funding</Link> / <Link href="/funding/offers">Offers</Link> / Compare</p>
        <h1 className={s.h1}>
          The advance costs about <span className={s.hAccent}>{about(r.adv.cost)}</span>. The sale costs about <span className={s.hCritical}>{about(r.sale.cost)} over {years} years</span>, and keeps going.
        </h1>
        <div className={s.tableWrap} role="region" aria-label="Offers side by side" tabIndex={0}>
          <table className={s.table}>
            <colgroup><col className={s.cLabel} /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <td className={s.corner} />
                <th scope="col" className={s.colBase}><span className={`${s.colTag} ${s.tagMuted}`}>Baseline</span><span className={s.colName}>No offer</span></th>
                <th scope="col" className={s.colAdv}><span className={`${s.colTag} ${s.tagAccent}`}>Royalty advance</span><span className={s.colName}>{usd(advanceOffer.cash)} now</span></th>
                <th scope="col" className={s.colSale}><span className={`${s.colTag} ${s.tagCritical}`}><CircleAlert size={11} strokeWidth={2.5} aria-hidden="true" />Permanent sale</span><span className={s.colName}>{usd(saleOffer.cash)} now</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={s.rowLabel}>{row.label}</th>
                  {row.cells.map((v, i) => {
                    const isMoney = typeof v === 'string' && v.startsWith('$');
                    const cls = [
                      [s.colBase, s.colAdv, s.colSale][i],
                      i === 0 ? s.vBase : '',
                      i === 2 && row.saleRed ? s.vSaleRed : '',
                      row.big ? s.big : isMoney || row.mono ? s.money : '',
                    ].join(' ');
                    return <td key={i} className={cls}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Assumptions a={a} flat={flat} terms={terms} form={form} setForm={setForm} onApply={applyAssumptions} />
        {decided}
        <div className={s.decide}>
          {acceptBtn('Accept advance (goes to approval)')}
          <Button size="lg" onClick={() => ask.current?.showModal()}>Request more info</Button>
          <Button size="lg" className={s.decideRight} onClick={() => setDeclined(true)} disabled={declined} disabledReason="Already declined.">Decline the sale</Button>
        </div>
      </div>

      <div className={s.phone}>
        <Link href="/funding" className={s.back}><ChevronLeft size={14} aria-hidden="true" />Funding</Link>
        <h1 className={s.pH1}>Two offers. Here&apos;s what each really costs.</h1>
        <PhoneCard name="No offer" tag={<span className={s.tagMuted}>Baseline</span>} cash="$0" cost="$0" note={`You keep all income, about ${usd(a.annualIncome)} a year.`} />
        <PhoneCard className={s.pAdv} name="Royalty advance" tag={<span className={s.tagAccent}>{r.adv.months} months</span>} cash={usd(advanceOffer.cash)} cost={usd(r.adv.cost)}
          note={`${pct(advanceOffer.shareBp)} of streaming until ${usd(advanceOffer.repayTotal)} is repaid. Then it ends.`} />
        <PhoneCard className={s.pSale} name="Catalog sale" tag={<span className={s.tagCritical} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CircleAlert size={11} strokeWidth={2.5} aria-hidden="true" />Permanent</span>}
          cash={usd(saleOffer.cash)} cost={<span className={s.vSaleRed}>{usd(r.sale.cost)}+</span>} note={`Half of ${saleOffer.album} income, forever. No buy-back.`} />
        <p className={o.small}>Income held flat at {usd(a.annualIncome)} a year. If it grows, the sale costs more.</p>
        {decided}
        <div className={s.pActions}>
          <Button onClick={() => ask.current?.showModal()} mobileFull>Ask a question</Button>
          {acceptBtn('Accept advance', true)}
        </div>
      </div>

      <dialog ref={ask} className={o.drawer} aria-labelledby="ask-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={o.drawerHead}><h2 id="ask-h" className={o.drawerTitle}>Ask about the offers</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => ask.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (question.trim()) { setAsked(true); setQuestion(''); ask.current?.close(); } }}>
          <label className={o.field}>Your question
            <textarea className={s.textarea} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="For example, can the sale include a buy-back after 5 years?" />
          </label>
          <p className={o.small}>Finance Agent drafts the email. You see it before it goes to anyone.</p>
          <div className={o.formActions}><Button variant="primary" type="submit" disabled={!question.trim()} disabledReason="Type a question first.">Save question</Button><Button onClick={() => ask.current?.close()}>Cancel</Button></div>
        </form>
      </dialog>
    </>
  );
}

function Assumptions({ a, flat, terms, form, setForm, onApply }: {
  a: OfferAssumptions; flat: boolean; terms: Props['terms'];
  form: { income: string; growth: string }; setForm: (f: { income: string; growth: string }) => void; onApply: (e: React.FormEvent) => void;
}) {
  return (
    <div>
      <p className={s.assume}>
        Projection uses {flat ? <>your last 12 months of streaming income ({usd(a.annualIncome)} a year) held flat</> : <>{usd(a.annualIncome)} a year of streaming income, growing {a.growthBp / 100}% a year</>}. It&apos;s an estimate; if income grows, the sale costs you more. Terms from offer documents received {terms.advance.received} and {terms.sale.received}.
      </p>
      <details>
        <summary className={o.linkInline} style={{ fontSize: 'var(--fs-meta)', display: 'inline-flex', minHeight: 'var(--tap-min)', alignItems: 'center' }}>Change assumptions</summary>
        <form className={s.assumeForm} onSubmit={onApply}>
          <label className={o.field}>Yearly streaming income ($)<input className={o.input} inputMode="decimal" value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} /></label>
          <label className={o.field}>Growth a year (%)<input className={o.input} inputMode="decimal" value={form.growth} onChange={(e) => setForm({ ...form, growth: e.target.value })} /></label>
          <Button type="submit">Recalculate</Button>
        </form>
      </details>
    </div>
  );
}

function PhoneCard({ name, tag, cash, cost, note, className = '' }: { name: string; tag: ReactNode; cash: string; cost: ReactNode; note: string; className?: string }) {
  return (
    <article className={`${s.pCard} ${className}`} aria-label={name}>
      <div className={s.pTop}><h2 className={s.pName}>{name}</h2><span className={s.pTag}>{tag}</span></div>
      <dl className={s.pGrid}>
        <div><dt>Cash now</dt><dd>{cash}</dd></div>
        <div><dt>Costs over 5 yrs</dt><dd>{cost}</dd></div>
      </dl>
      <p className={s.pNote}>{note}</p>
    </article>
  );
}
