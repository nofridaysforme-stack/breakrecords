'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Money, Waterfall } from '@/components/ui/Money';
import type { Statement } from '@/data/money';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import type { Scenario } from '@/data/types';
import { formatMoney } from '@breakrecords/core/money';
import s from './Money.module.css';

function toCsv(st: Statement) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Step', 'Rule', 'Amount', 'Running balance', 'Source']];
  st.rows.forEach((r) => lines.push([r.label, r.kind === 'subtotal' ? '' : r.rule, r.kind === 'subtotal' ? '' : (r.amount / 100).toFixed(2), (r.balance / 100).toFixed(2), r.kind === 'subtotal' ? '' : r.source ?? '']));
  lines.push([`${st.payee} nets`, '', '', (st.net / 100).toFixed(2), '']);
  return lines.map((l) => l.map(q).join(',')).join('\n');
}

export function StatementView({ st, scenario = 'default' }: { st: Statement; scenario?: Scenario }) {
  const [asked, setAsked] = useState<{ question: string; answer: string; basis: string }[]>(st.qa ? [st.qa[0]] : []);
  const [q, setQ] = useState('');
  const net = formatMoney(st.net);
  const month = st.period.split(' ')[0];

  const ask = (question: string) => {
    const hit = st.qa?.find((x) => x.question.toLowerCase() === question.toLowerCase())
      ?? st.qa?.find((x) => question.toLowerCase().split(/\W+/).some((w) => w.length > 4 && x.question.toLowerCase().includes(w)));
    setAsked((a) => [...a, hit ?? { question, answer: 'I don’t have a confident answer from this statement. I logged your question for the Royalties Agent; the reply shows up in the activity log.', basis: 'No matching line in this statement.' }]);
  };

  const download = () => {
    const blob = new Blob([toCsv(st)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${st.id}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className={s.statement}>
      <div className={s.stMain}>
        <nav aria-label="Breadcrumb" className={s.crumb}><Link href="/money/royalties">Money</Link> / <Link href="/money/statements">Statements</Link> / {st.payee}</nav>
        <div className={`${s.head} ${s.stHead}`}>
          <div>
            <h1 className={s.stTitle}>{st.payee} earned <span className={s.accent}>{net}</span> from {st.release} in {month}</h1>
            <p className={s.sub}>Statement {st.id} · {st.split} · pays {st.pays}</p>
            {st.held && <p className={s.heldNote} role="note"><strong><Money cents={st.held.amount} /> held.</strong> {st.held.note.replace(/^\S+ held in reserve/, 'In reserve')} It’s paid once released.</p>}
          </div>
          <div className={s.filters}>
            <Button onClick={download}>CSV</Button>
            <Button variant="primary" onClick={() => window.print()}>Download PDF</Button>
          </div>
        </div>
        <ScreenState scenario={scenario} copy={STATES.statement}>
          <Waterfall rows={st.rows} totalLabel={`${st.payee} nets`} caption={`How ${st.payee}'s ${month} earnings were calculated`} sourceHref={(id) => `/money/royalties#${id}`} />
          <p className={s.small}>Every line links to its row in the source statement. Audit ID {st.auditId}.</p>
        </ScreenState>
      </div>
      <aside className={s.ask} aria-labelledby="ask">
        <h2 id="ask" className={s.askTitle}>Ask about this statement</h2>
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {asked.map((x, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className={s.bubble}>{x.question}</p>
              <div className={s.agent}>
                <p className={s.agentName}><span className={s.square} aria-hidden="true" />Royalties Agent</p>
                <p className={s.answer}>{x.answer}</p>
                <p className={s.basis}>{x.basis}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={s.chips}>
          {st.qa?.slice(1).filter((x) => !asked.includes(x)).map((x) => <button key={x.question} type="button" className={s.chip} onClick={() => ask(x.question)}>{x.question}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { ask(q.trim()); setQ(''); } }}>
          <label htmlFor="ask-q" className="visually-hidden">Ask a question</label>
          <input id="ask-q" className={s.askInput} placeholder="Ask a question" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </aside>
    </div>
  );
}
