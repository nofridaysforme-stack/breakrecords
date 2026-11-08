'use client';

import { useRef, useState } from 'react';
import { Check, Circle, CircleAlert, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Eyebrow } from '@/components/type/Type';
import type { Recoup } from '@/data/money';
import { formatPercent } from '@breakrecords/core/percent';
import { pctOf } from '@breakrecords/core/splits';
import { toCents } from '@breakrecords/core/money';
import s from './Money.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Oct 2026" -> "October". */
const monthName = (v?: string) => MONTHS.find((m) => v?.startsWith(m.slice(0, 3))) ?? v ?? '';

export function RecoupmentView({ items }: { items: Recoup[] }) {
  const [list, setList] = useState(items);
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ release: items[0].id, category: '', amount: '', share: '100' });
  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);
  const addCost = async () => {
    const cost = toCents(Number(form.amount));
    if (!form.category.trim() || !(cost > 0)) { setError('Add a category and an amount above $0.00.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/money/recoupment/costs', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ releaseId: form.release, category: form.category.trim(), cost, shareBp: Math.round(Number(form.share) * 100) }) });
      const body = await res.json();
      if (!res.ok) { setError(body.message ?? 'That cost wasn’t saved.'); return; }
      setList(body.items);
      setForm({ ...form, category: '', amount: '' }); setError(''); dialog.current?.close();
    } catch { setError('Couldn’t reach the server. The cost wasn’t saved.'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className={s.head}>
        <div><PageTitle>Recoupment</PageTitle><p className={s.sub}>What each release owes back before profit splits begin</p></div>
        <Button variant="primary" onClick={() => dialog.current?.showModal()}>Add a cost</Button>
      </div>
      {list.map((r) => {
        const costs = r.costs.reduce((a, c) => a + pctOf(c.cost, c.shareBp), 0);
        const total = r.advance + costs;
        const remaining = Math.max(0, total - r.recouped);
        const done = remaining === 0;
        const pct = total ? Math.min(100, (r.recouped / total) * 100) : 100;
        return (
          <article key={r.id} className={s.recoup} aria-labelledby={`rc-${r.id}`}>
            <div className={s.recoupMain}>
              <div className={s.recoupTop}>
                <div><h2 id={`rc-${r.id}`} className={s.recoupTitle}>{r.title}</h2><p className={s.rowMeta} style={{ fontSize: 'var(--fs-body)' }}>{r.artist}</p></div>
                <span className={`${s.status} ${done ? s.sSent : s.sAwaiting}`}>{done ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : <Circle size={13} strokeWidth={2.5} aria-hidden="true" />}{done ? `Recouped in ${monthName(r.recoupedIn)}` : 'Recouping'}</span>
              </div>
              <div>
                <div className={s.recoupBar} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(pct)}% recouped`}><div className={`${s.recoupFill} ${done ? s.fillGood : s.fillAccent}`} style={{ width: `${pct}%` }} /></div>
                <div className={s.recoupNums} style={{ marginTop: 6 }}><span><Money cents={r.recouped} /> recouped</span><span><Money cents={remaining} /> to go</span></div>
              </div>
              <dl className={s.recoupStats}>
                <div className={s.recoupStat}><dt className={s.statLabel}>Advance</dt><dd className={s.recoupStatValue}><Money cents={r.advance} /></dd></div>
                <div className={s.recoupStat}><dt className={s.statLabel}>Recoupable costs</dt><dd className={s.recoupStatValue}><Money cents={costs} /></dd></div>
                <div className={s.recoupStat}><dt className={s.statLabel}>Total to recoup</dt><dd className={s.recoupStatValue}><Money cents={total} /></dd></div>
                <div className={s.recoupStat}><dt className={s.statLabel}>{done ? 'Recouped' : 'Projected'}</dt><dd className={s.recoupStatValue}>{done ? r.recoupedIn : r.projected}</dd></div>
              </dl>
            </div>
            <section aria-label={`${r.title} costs by category`}>
              <Eyebrow as="h3" className={s.monoMeta}>Costs by category</Eyebrow>
              <ul style={{ marginTop: 6 }}>
                {r.costs.map((c) => (
                  <li key={c.category} className={s.cat}>
                    <span>{c.category}</span>
                    <span className={s.catShare}>{formatPercent(c.shareBp)}</span>
                    <span className={s.amount}><Money cents={pctOf(c.cost, c.shareBp)} />{c.shareBp < 10000 && <span className={s.catOf}>of <Money cents={c.cost} /></span>}</span>
                  </li>
                ))}
              </ul>
            </section>
          </article>
        );
      })}

      <dialog ref={dialog} className={s.drawer} aria-labelledby="add-cost" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className={s.drawerHead}><h2 id="add-cost" className={s.cardTitle}>Add a cost</h2><button type="button" className={s.iconBtn} aria-label="Close" onClick={() => dialog.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <form style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }} onSubmit={(e) => { e.preventDefault(); addCost(); }}>
          <label className={s.field}>Release<select className={s.input} value={form.release} onChange={(e) => setForm({ ...form, release: e.target.value })}>{list.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
          <label className={s.field}>Category<input className={s.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="For example: Radio promo" /></label>
          <label className={s.field}>Full cost in dollars<input className={s.input} type="number" min={0} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label className={s.field}>Recoupable share<select className={s.input} value={form.share} onChange={(e) => setForm({ ...form, share: e.target.value })}><option value="100">100%</option><option value="50">50%</option><option value="0">0% (label pays)</option></select></label>
          {error && <p className={s.small} style={{ color: 'var(--critical)', display: 'flex', gap: 6, alignItems: 'center' }} role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</p>}
          <p className={s.small}>Recoupable costs come out of the release&apos;s income before the profit split. This doesn&apos;t move any money.</p>
          <div className={s.formActions}><Button type="submit" variant="primary" disabled={busy}>Add cost</Button><Button onClick={() => dialog.current?.close()}>Cancel</Button></div>
        </form>
      </dialog>
    </>
  );
}
