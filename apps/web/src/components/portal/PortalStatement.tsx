'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import type { Statement } from '@/data/money';
import { withAs } from './payee';
import s from './Portal.module.css';

/** 4h: one statement as a plain list, with "Why this amount?" and Download PDF. */
export function PortalStatement({ st, payeeId }: { st: Statement; payeeId: string }) {
  const why = useRef<HTMLDialogElement>(null);
  const answer = st.qa?.[0];
  return (
    <>
      <Link href={withAs('/portal/statements', payeeId)} className={s.back}><ChevronLeft size={14} aria-hidden="true" />Statements</Link>
      <div>
        <p className={s.stMeta}>{st.release} · {st.period}</p>
        <h1 className={s.stAmount}><Money cents={st.net} /></h1>
        <p className={s.stPays}>Pays {st.pays.split(' on ')[0]}</p>
        {st.held && <p className={s.note} role="note"><strong><Money cents={st.held.amount} /> of this is held</strong> while a recording is checked for artificial streams. It’s paid to you once released.</p>}
      </div>
      <ul aria-label="Statement lines">
        {st.rows.map((r, i) => (
          <li key={i} className={`${s.stRow} ${r.kind !== 'step' ? s.stRowSub : ''}`}>
            <span>{r.label}</span>
            <span className={`${s.stRowAmt} ${r.kind === 'step' && r.amount < 0 ? s.stNeg : ''}`}><Money cents={r.kind === 'subtotal' ? r.balance : r.amount} /></span>
          </li>
        ))}
      </ul>
      <div className={s.stActions}>
        <Button size="lg" onClick={() => why.current?.showModal()}>Why this amount?</Button>
        <Button variant="primary" size="lg" onClick={() => window.print()}>Download PDF</Button>
      </div>
      <dialog ref={why} className={s.drawer} aria-labelledby="why" onClick={(e) => { if (e.target === why.current) why.current?.close(); }}>
        <h2 id="why" className={s.cardTitle}>Why this amount?</h2>
        <p style={{ fontSize: 'var(--fs-body)', lineHeight: 1.55, marginTop: 10 }}>
          {answer ? answer.answer : `Each line above comes off the income in order. What is left after the last line is what you receive.`}
        </p>
        {answer && <p className={s.note} style={{ marginTop: 8 }}>{answer.basis}</p>}
        <div className={s.stActions} style={{ marginTop: 16 }}><Button size="lg" onClick={() => why.current?.close()}>Close</Button></div>
      </dialog>
    </>
  );
}
