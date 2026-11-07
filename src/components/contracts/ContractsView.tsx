'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Circle, CircleAlert, Upload, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import type { getContracts } from '@/data/api';
import type { SigState } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Contracts.module.css';

type Data = ReturnType<typeof getContracts>;

const SIG: Record<SigState, { Icon: typeof Check; cls: string }> = {
  waiting: { Icon: CircleAlert, cls: o.critical },
  signed: { Icon: Check, cls: o.good },
  partial: { Icon: Circle, cls: o.accent },
};

/** 5b. Agreements with key dates and signatures, then the templates they come from. */
export function ContractsView({ data }: { data: Data }) {
  const draft = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLDialogElement>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [file, setFile] = useState<string>('');

  return (
    <>
      <div className={`${o.head} ${s.head}`}>
        <div><PageTitle>Contracts</PageTitle><p className={o.sub}>{data.summary}</p></div>
        <div className={o.actions}>
          <Button onClick={() => upload.current?.showModal()}>Upload a contract for review</Button>
          <Button variant="primary" onClick={() => draft.current?.showModal()}>Draft from template</Button>
        </div>
      </div>
      {uploaded && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />Legal Agent is reviewing {uploaded} against your playbook. You&apos;ll get its notes before anything is signed.</p>}

      <div className={o.tableWrap} role="region" aria-label="Agreements" tabIndex={0}>
        <table className={`${o.table} ${s.table}`}>
          <colgroup><col className={s.cName} /><col className={s.cParties} /><col className={s.cTerms} /><col className={s.cDate} /><col className={s.cSig} /></colgroup>
          <thead><tr><th scope="col">Agreement</th><th scope="col">Parties</th><th scope="col">Key terms</th><th scope="col">Next date</th><th scope="col">Signatures</th></tr></thead>
          <tbody>
            {data.contracts.map((c) => {
              const { Icon, cls } = SIG[c.sigState];
              return (
                <tr key={c.id}>
                  <th scope="row">
                    {c.href ? <Link href={c.href} className={s.name}>{c.name}</Link> : <span className={s.nameText}>{c.name}</span>}
                    <span className={o.rowSub}>{c.templateId ? <Link href={`/contracts/templates/${c.templateId}`} className={s.tplLink}>{c.template}</Link> : c.template}</span>
                  </th>
                  <td className={o.text2}>{c.parties}</td>
                  <td className={o.text2}>{c.terms}</td>
                  <td><span className={o.dateMono}>{c.date ?? 'n/a'}</span>{c.dateWhat && <span className={o.rowSub}>{c.dateWhat}</span>}</td>
                  <td><span className={`${o.status} ${cls}`}><Icon size={13} strokeWidth={2.5} aria-hidden="true" />{c.sig}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className={o.section} aria-labelledby="tpl-h">
        <h2 id="tpl-h" className={o.sectionTitle}>Templates</h2>
        <ul className={s.templates}>
          {data.templates.map((t) => (
            <li key={t.id}><Link href={`/contracts/templates/${t.id}`} className={`${o.card} ${s.tpl}`}><span className={o.cardTitle}>{t.name}</span><span className={o.cardMeta}>{t.version}</span></Link></li>
          ))}
        </ul>
      </section>

      <dialog ref={draft} className={o.drawer} aria-labelledby="draft-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={o.drawerHead}><h2 id="draft-h" className={o.drawerTitle}>Draft from template</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => draft.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <p className={o.small}>Pick a template. Legal Agent drafts it, and you review it before anyone is asked to sign.</p>
        <ul className={s.pick}>
          {data.templates.map((t) => (
            <li key={t.id}><Link href={`/contracts/templates/${t.id}?draft=1`} className={`${o.card} ${s.tpl}`}><span className={o.cardTitle}>{t.name}</span><span className={o.cardMeta}>{t.version} · {t.summary}</span></Link></li>
          ))}
        </ul>
      </dialog>

      <dialog ref={upload} className={o.drawer} aria-labelledby="up-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={o.drawerHead}><h2 id="up-h" className={o.drawerTitle}>Upload a contract for review</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => upload.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (file) { setUploaded(file); setFile(''); upload.current?.close(); } }}>
          <label className={o.drop}>
            <span><Upload size={18} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px' }} />{file || 'Drop a PDF or Word file, or choose one'}</span>
            <input type="file" accept=".pdf,.doc,.docx" className="visually-hidden" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
          </label>
          <p className={o.small}>Legal Agent compares it with your playbook and flags terms. It doesn&apos;t sign or reply to anyone.</p>
          <div className={o.formActions}>
            <Button variant="primary" type="submit" disabled={!file} disabledReason="Choose a file first.">Send for review</Button>
            <Button onClick={() => upload.current?.close()}>Cancel</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
