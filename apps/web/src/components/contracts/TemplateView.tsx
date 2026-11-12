'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Plus, TriangleAlert, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useDecisions } from '@/data/decisions';
import type { Contract, Template } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Contracts.module.css';

type Wording = { summary: string; clauses: { title: string; text: string }[]; playbook: string[] };

/**
 * Contracts > Templates detail (undrawn): clauses, playbook rules and where it's used. A starter
 * from the Indie SRVCS library is read only until the workspace makes its own copy; its own
 * copy's wording is edited here and each save is a new version.
 */
export function TemplateView({ template: t, usedIn, openDraft, staff = false }: { template: Template; usedIn: Contract[]; openDraft?: boolean; staff?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Wording | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  async function send(url: string, method: 'POST' | 'PUT', body: object, ok: string) {
    setBusy(true); setFail(null); setNote(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setFail(out?.message ?? 'That wasn’t saved.'); return false; }
      setNote(ok); router.refresh(); return true;
    } catch { setFail('Couldn’t reach the server. Nothing changed.'); return false; } finally { setBusy(false); }
  }
  const base = `/api/contracts/templates/${encodeURIComponent(t.id)}`;
  const save = async () => {
    if (!editing) return;
    const w = { summary: editing.summary.trim(), clauses: editing.clauses.map((c) => ({ title: c.title.trim(), text: c.text.trim() })), playbook: editing.playbook.map((p) => p.trim()).filter(Boolean) };
    if (!w.summary || !w.clauses.length || w.clauses.some((c) => !c.title || !c.text)) { setFail('Every clause needs a title and its wording, and the template needs a summary.'); return; }
    if (await send(base, 'PUT', w, 'Saved as a new version. Agreements already drafted keep the wording they were drafted from.')) setEditing(null);
  };
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
      context: t.reviewed ? 'Drafted from template' : 'Drafted from a template not yet reviewed by a lawyer. Have your attorney review it before anyone signs.',
      href: `/contracts/templates/${t.id}`, dept: 'Legal', artists: [], releases: [],
    });
    setSent(party.trim()); setParty(''); setTerms(''); setError(''); dialog.current?.close();
  };

  return (
    <>
      <p className={o.crumb}><Link href="/contracts">Contracts</Link> / Templates / {t.name}</p>
      <div className={o.head}>
        <div><PageTitle>{t.name}</PageTitle><p className={o.sub}>{t.origin === 'starter' ? 'Indie SRVCS starter' : 'Your template'} · {t.version} · updated {t.updated}</p></div>
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          {t.origin === 'starter' && <Button disabled={busy} onClick={() => void send(`${base}/copy`, 'POST', {}, 'This is now your own copy. You can change its wording.')}>Make my own copy</Button>}
          {t.origin === 'own' && !editing && <Button onClick={() => { setNote(null); setFail(null); setEditing({ summary: t.summary, clauses: t.clauses.map((c) => ({ ...c })), playbook: [...t.playbook] }); }}>Edit wording</Button>}
          <Button variant="primary" onClick={() => dialog.current?.showModal()}>Draft from this template</Button>
        </span>
      </div>
      {!t.reviewed && (
        <p className={`${o.note} ${s.warnLine}`} role="note"><TriangleAlert size={16} className={o.warn} aria-hidden="true" />
          <span><strong>Starter template, not yet reviewed by a lawyer.</strong> Have your attorney review before signing.{t.origin === 'own' ? ' Your copy was made from it.' : ''}</span>
        </p>
      )}
      {note && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{note}</p>}
      {fail && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not saved. {fail}</p>}
      {(sent || mine.length > 0) && (
        <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />
          {sent ? <>Legal Agent is drafting the agreement with {sent}.</> : <>A draft from this template is waiting.</>} It&apos;s in <Link href="/approvals" className={o.linkInline}>Approvals</Link> for you to review. Nobody is asked to sign until you approve.{!t.reviewed && ' This template hasn’t been reviewed by a lawyer, so have your attorney check the draft.'}
        </p>
      )}
      <div className={s.tplLayout}>
        <section className={o.section} aria-labelledby="cl-h">
          <p className={o.text2} style={{ fontSize: 'var(--fs-body-lg)' }}>{t.summary}</p>
          <h2 id="cl-h" className={o.sectionTitle}>Clauses</h2>
          {editing ? (
            <form className={o.form} aria-label="Edit wording" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <label className={o.field}>Summary<textarea className={o.input} rows={2} value={editing.summary} maxLength={500} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></label>
              {editing.clauses.map((c, i) => (
                <fieldset key={i} className={s.clauseEdit}>
                  <legend className={o.small}>Clause {i + 1}</legend>
                  <label className={o.field}>Title<input className={o.input} value={c.title} maxLength={120} onChange={(e) => setEditing({ ...editing, clauses: editing.clauses.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></label>
                  <label className={o.field}>Wording<textarea className={o.input} rows={3} value={c.text} maxLength={4000} onChange={(e) => setEditing({ ...editing, clauses: editing.clauses.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} /></label>
                  {editing.clauses.length > 1 && <div><Button size="sm" onClick={() => setEditing({ ...editing, clauses: editing.clauses.filter((_, j) => j !== i) })}>Remove clause {i + 1}</Button></div>}
                </fieldset>
              ))}
              <div><Button size="sm" onClick={() => setEditing({ ...editing, clauses: [...editing.clauses, { title: '', text: '' }] })}><Plus size={14} aria-hidden="true" />Add a clause</Button></div>
              <label className={o.field}>Playbook rules <span className={o.hint}>One per line. Legal Agent flags drafts that break them.</span>
                <textarea className={o.input} rows={3} value={editing.playbook.join('\n')} onChange={(e) => setEditing({ ...editing, playbook: e.target.value.split('\n') })} /></label>
              <div className={o.formActions}>
                <Button type="submit" variant="primary" disabled={busy}>Save as a new version</Button>
                <Button onClick={() => { setEditing(null); setFail(null); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <dl className={s.clauses}>
              {t.clauses.map((c, i) => <div key={`${i}-${c.title}`} className={s.clause}><dt className={s.clauseTitle}>{c.title}</dt><dd className={o.text2} style={{ margin: 0 }}>{c.text}</dd></div>)}
            </dl>
          )}
        </section>
        <div className={s.side}>
          <section className={o.card} aria-labelledby="pb-h" style={{ padding: '18px 20px', gap: 10 }}>
            <h2 id="pb-h" className={o.eyebrow}>Your playbook</h2>
            <ul className={s.playbook}>{t.playbook.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className={o.small}>Legal Agent flags any draft or uploaded contract that breaks these.</p>
          </section>
          {t.origin === 'own' && t.history.length > 0 && (
            <section className={o.card} aria-labelledby="ver-h" style={{ padding: '18px 20px', gap: 8 }}>
              <h2 id="ver-h" className={o.eyebrow}>Versions</h2>
              <ul className={s.used}>{t.history.map((h) => <li key={h.version + h.saved} className={s.usedRow}><span>{h.version}</span><span className={o.text2}>{h.saved}</span></li>)}</ul>
              <p className={o.small}>Agreements keep the version they were drafted from.</p>
            </section>
          )}
          {staff && t.origin === 'starter' && (
            <section className={o.card} aria-labelledby="rev-h" style={{ padding: '18px 20px', gap: 8 }}>
              <h2 id="rev-h" className={o.eyebrow}>Indie SRVCS staff</h2>
              <p className={o.small}>{t.reviewed ? 'Recorded as reviewed by an attorney. Every workspace sees it without the warning.' : 'Shown to every workspace with the “not reviewed” warning.'}</p>
              <div>{t.reviewed
                ? <Button size="sm" disabled={busy} onClick={() => void send(`${base}/review`, 'POST', { reviewed: false }, 'Review withdrawn. The warning is back for every workspace.')}>Withdraw the review</Button>
                : <Button size="sm" disabled={busy} onClick={() => void send(`${base}/review`, 'POST', { reviewed: true }, 'Recorded as reviewed by an attorney.')}>An attorney reviewed this wording</Button>}</div>
            </section>
          )}
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
