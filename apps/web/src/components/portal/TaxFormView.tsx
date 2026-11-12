'use client';

import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Payee } from '@/data/money';
import s from './Portal.module.css';

type Form = 'W-9' | 'W-8BEN' | 'W-8BEN-E';
const FORMS: { id: Form; label: string; hint: string }[] = [
  { id: 'W-9', label: 'W-9', hint: 'You’re a US citizen or US resident.' },
  { id: 'W-8BEN', label: 'W-8BEN', hint: 'You’re a person living outside the US.' },
  { id: 'W-8BEN-E', label: 'W-8BEN-E', hint: 'You’re paid as a company based outside the US.' },
];

/** The payee's tax form (4g Tax), and certifying a new one. Only the payee themselves can sign it. */
export function TaxFormView({ p: initial, as }: { p: Payee; as?: string }) {
  const [p, setP] = useState(initial);
  const [open, setOpen] = useState(!initial.tax.ok);
  const [form, setForm] = useState<Form>('W-9');
  const [f, setF] = useState({ legalName: '', tin: '', country: '', treaty: false, article: '', rate: '', signature: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const w9 = form === 'W-9';
  const rate = Number(f.rate);
  const valid = !!f.legalName.trim() && !!f.signature.trim()
    && (w9 ? /^\d{4}$/.test(f.tin) : /^[A-Z]{2}$/.test(f.country) && f.country !== 'US' && (!f.treaty || (!!f.article.trim() && f.rate !== '' && rate >= 0 && rate <= 30)));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'treaty' ? e.target.checked : e.target.value });

  async function submit() {
    setError(null); setSaved(false);
    const body = {
      form, legalName: f.legalName.trim(), signature: f.signature.trim(),
      ...(w9 ? { tinLast4: f.tin } : { country: f.country, ...(f.treaty ? { treaty: { article: f.article.trim(), rateBp: Math.round(rate * 100) } } : {}) }),
    };
    try {
      const res = await fetch(`/api/portal/tax-form${as ? `?as=${encodeURIComponent(as)}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) { setError(out.message ?? 'That form wasn’t saved.'); return; }
      setP(out); setSaved(true); setOpen(false);
      setF({ legalName: '', tin: '', country: '', treaty: false, article: '', rate: '', signature: '' });
    } catch { setError('Couldn’t reach the server. Nothing was saved.'); }
  }

  return (
    <>
      <h1 className={s.h1}>Tax forms</h1>
      <section className={s.card} aria-labelledby="form-on-file" style={{ maxWidth: 560 }}>
        <h2 id="form-on-file" className={s.cardTitle}>{p.tax.form === 'None' ? 'No form on file' : p.tax.form}</h2>
        {p.tax.ok
          ? <p className={s.taxOk}><Check size={16} strokeWidth={3} aria-hidden="true" />{p.tax.label}</p>
          : <p className={s.taxWarn}><CircleAlert size={16} aria-hidden="true" />{p.tax.label}</p>}
        {p.tax.withholding && <p className={s.promptText}>{p.tax.withholding}.</p>}
        <p className={s.note}>{p.tax.expires ? `${p.tax.expires}. ` : ''}A W-9 doesn’t expire. A W-8 lasts until the end of the third year after you sign it.</p>
        {saved && <p className={s.ok} role="status">Saved. {p.label} now has your {p.tax.form}.</p>}
        {p.tax.canSubmit && !open && <div><Button onClick={() => setOpen(true)}>{p.tax.form === 'None' ? 'Fill in a tax form' : 'Submit a new form'}</Button></div>}
      </section>

      {p.tax.canSubmit && open && (
        <section className={s.card} aria-labelledby="new-form" style={{ maxWidth: 560 }}>
          <h2 id="new-form" className={s.cardTitle}>Certify your tax form</h2>
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (valid) void submit(); }}>
            <fieldset className={s.choices}>
              <legend>Which form?</legend>
              {FORMS.map((x) => (
                <label key={x.id} className={s.choice}>
                  <input type="radio" name="form" value={x.id} checked={form === x.id} onChange={() => setForm(x.id)} />
                  <span><strong>{x.label}</strong> <span className={s.note}>{x.hint}</span></span>
                </label>
              ))}
            </fieldset>
            <label className={s.field}>Legal name<input className={s.input} autoComplete="name" value={f.legalName} onChange={set('legalName')} maxLength={200} /></label>
            {w9 ? (
              <label className={s.field}>Last 4 digits of your SSN or EIN
                <input className={s.input} inputMode="numeric" autoComplete="off" value={f.tin} onChange={(e) => setF({ ...f, tin: e.target.value.replace(/\D/g, '').slice(0, 4) })} maxLength={4} aria-describedby="tin-note" />
                <span id="tin-note" className={s.note}>Only the last 4 digits are kept here. The payout provider collects the full number when payments start.</span>
              </label>
            ) : (
              <>
                <label className={s.field}>Country of tax residence (2 letters, like GB)
                  <input className={s.input} autoComplete="country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) })} maxLength={2} />
                </label>
                <label className={s.choice}><input type="checkbox" checked={f.treaty} onChange={set('treaty')} />I claim a tax treaty rate on royalties</label>
                {f.treaty && (
                  <>
                    <label className={s.field}>Treaty article<input className={s.input} value={f.article} onChange={set('article')} maxLength={20} placeholder="12" /></label>
                    <label className={s.field}>Treaty rate on royalties (%)<input className={s.input} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, '') })} maxLength={5} /></label>
                  </>
                )}
                <p className={s.note}>Without a treaty, US rules withhold 30% of royalties paid to you.</p>
              </>
            )}
            <label className={s.field}>Signature (type your full name)<input className={s.input} value={f.signature} onChange={set('signature')} maxLength={200} /></label>
            <p className={s.note}>By signing, you certify under penalties of perjury that this information is true and correct. Dated today.</p>
            {error && <p className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />Not saved. {error}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button type="submit" variant="primary" disabled={!valid} disabledReason={w9 ? 'Enter your legal name, the last 4 digits and your signature.' : 'Enter your legal name, a country outside the US, any treaty details and your signature.'}>Sign and submit {form}</Button>
              {p.tax.ok && <Button onClick={() => setOpen(false)}>Cancel</Button>}
            </div>
          </form>
        </section>
      )}
    </>
  );
}
