'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useDecisions } from '@/data/decisions';
import type { Contract, Template } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Contracts.module.css';

/** Contracts > Templates detail (undrawn): clauses, playbook rules and where it's used. */
export function TemplateView({ template: t, usedIn, openDraft }: { template: Template; usedIn: Contract[]; openDraft?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { propose, proposals, decisions } = useDecisions();
  const [party, setParty] = useState('');
  const [terms, setTerms] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => { if (openDraft && !dialog.current?.open) dialog.current?.showModal(); }, [openDraft]);
  const mine = proposals.filter((p) => p.id.startsWith(`draft_${t.id}_`) && !decisions[p.id]);

  const submit = () => {
    if (!party.trim()) { setError('Add who the agreement is with.'); return; }
    const id = `draft_${t.id}_${party.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    propose({
      id, type: 'signature', title: `${t.name}, ${party.trim()}`, agent: 'Legal Agent', due: 'Nov 13',
      impact: terms.trim() || `From ${t.name.toLowerCase()} ${t.version.split(' ')[0]}`, risk: 'needsEyes',
      context: 'Drafted from template', href: `/contracts/templates/${t.id}`, dept: 'Legal', artists: [], releases: [],
    });
    setSent(party.trim()); setParty(''); setTerms(''); setError(''); dialog.current?.close();
  };

  return (
    <>
      <p className={o.crumb}><Link href="/contracts">Contracts</Link> / Templates / {t.name}</p>
      <div className={o.head}>
        <div><PageTitle>{t.name}</PageTitle><p className={o.sub}>{t.version} · updated {t.updated}</p></div>
        <Button variant="primary" onClick={() => dialog.current?.showModal()}>Draft from this template</Button>
      </div>
      {(sent || mine.length > 0) && (
        <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />
          {sent ? <>Legal Agent is drafting the agreement with {sent}.</> : <>A draft from this template is waiting.</>} It&apos;s in <Link href="/approvals" className={o.linkInline}>Approvals</Link> for you to review. Nobody is asked to sign until you approve.
        </p>
      )}
      <div className={s.tplLayout}>
        <section className={o.section} aria-labelledby="cl-h">
          <p className={o.text2} style={{ fontSize: 'var(--fs-body-lg)' }}>{t.summary}</p>
          <h2 id="cl-h" className={o.sectionTitle}>Clauses</h2>
          <dl className={s.clauses}>
            {t.clauses.map((c) => <div key={c.title} className={s.clause}><dt className={s.clauseTitle}>{c.title}</dt><dd className={o.text2} style={{ margin: 0 }}>{c.text}</dd></div>)}
          </dl>
        </section>
        <div className={s.side}>
          <section className={o.card} aria-labelledby="pb-h" style={{ padding: '18px 20px', gap: 10 }}>
            <h2 id="pb-h" className={o.eyebrow}>Your playbook</h2>
            <ul className={s.playbook}>{t.playbook.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className={o.small}>Legal Agent flags any draft or uploaded contract that breaks these.</p>
          </section>
          <section className={o.card} aria-labelledby="used-h" style={{ padding: '18px 20px', gap: 8 }}>
            <h2 id="used-h" className={o.eyebrow}>Used in</h2>
            {usedIn.length ? (
              <ul className={s.used}>{usedIn.map((c) => <li key={c.id} className={s.usedRow}><span>{c.name}</span><span className={o.text2}>{c.parties}</span></li>)}</ul>
            ) : <p className={o.small}>No active agreements use this template yet.</p>}
          </section>
        </div>
      </div>

      <dialog ref={dialog} className={o.drawer} aria-labelledby="dt-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={o.drawerHead}><h2 id="dt-h" className={o.drawerTitle}>Draft {t.name.toLowerCase()}</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => dialog.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <label className={o.field}>With
            <input className={o.input} value={party} onChange={(e) => setParty(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'dt-err' : undefined} placeholder="Artist, producer or company" />
          </label>
          {error && <p id="dt-err" className={o.critical} role="alert" style={{ fontSize: 'var(--fs-meta)' }}>{error}</p>}
          <label className={o.field}>Key terms <span className={o.hint}>Optional. Anything you&apos;ve already agreed.</span>
            <input className={o.input} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="For example, 3 points and a $1,500 advance" />
          </label>
          <p className={o.small}>The draft comes to your Approvals first. Signing always needs you.</p>
          <div className={o.formActions}><Button variant="primary" type="submit">Draft it</Button><ButtonLink href="/contracts">Cancel</ButtonLink></div>
        </form>
      </dialog>
    </>
  );
}
