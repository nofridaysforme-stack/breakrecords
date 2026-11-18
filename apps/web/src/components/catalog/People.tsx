'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { z } from 'zod';
import type { PeopleResponse, PersonResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Blocks';
import o from '@/components/ops/Ops.module.css';
import s from './Catalog.module.css';

export type PeopleList = z.infer<typeof PeopleResponse>['people'];
type Person = z.infer<typeof PersonResponse>;
const TYPE = { person: 'Person', group: 'Group', company: 'Company' } as const;

/** Catalog > People: everyone credited, writing, publishing or owning masters, and what the forms still need. */
export function PeopleTable({ people }: { people: PeopleList }) {
  if (!people.length) {
    return <EmptyState title="No one here yet">People appear once you add a release, a credit or a writer. You can then fill in what the rights forms need about each one.</EmptyState>;
  }
  return (
    <div className={o.tableWrap} role="region" aria-label="People" tabIndex={0}>
      <table className={o.table}>
        <thead><tr><th scope="col">Name</th><th scope="col">On your catalog as</th><th scope="col">For the rights forms</th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <th scope="row"><Link href={`/catalog/people/${p.id}`} className={o.rowLink}>{p.name}</Link><span className={o.small}> {TYPE[p.type]}</span></th>
              <td className={o.text2}>{p.roles}</td>
              <td>{p.missing.length
                ? <span className={`${o.status} ${o.warn}`}><CircleAlert size={13} strokeWidth={2.5} aria-hidden="true" />{p.missing.length} missing: {p.missing.slice(0, 3).join(', ')}{p.missing.length > 3 ? ', and more' : ''}</span>
                : <span className={`${o.status} ${o.good}`}><Check size={13} strokeWidth={2.5} aria-hidden="true" />All on file</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PROS: [string, string][] = [['', 'Not set'], ['ascap', 'ASCAP'], ['bmi', 'BMI'], ['sesac', 'SESAC'], ['gmr', 'GMR'], ['socan', 'SOCAN'], ['prs', 'PRS'], ['other', 'Another PRO'], ['none', 'Not in a PRO']];
type Field = 'legalName' | 'pro' | 'ipi' | 'isni' | 'email' | 'phone' | 'address' | 'citizenship' | 'domicile';
const FIELDS: Field[] = ['legalName', 'pro', 'ipi', 'isni', 'email', 'phone', 'address', 'citizenship', 'domicile'];

/** One person or company: the facts the rights forms use, edited in one place. */
export function PersonEditor({ person: initial, back }: { person: Person; back?: string }) {
  const [person, setPerson] = useState(initial);
  const [form, setForm] = useState(() => ({ name: initial.name, type: initial.type, ...Object.fromEntries(FIELDS.map((f) => [f, initial[f] ?? ''])) }) as Record<Field | 'name' | 'type', string>);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const changed = Object.fromEntries((['name', 'type', ...FIELDS] as const).filter((k) => form[k].trim() !== String((person as Record<string, unknown>)[k] ?? '')).map((k) => [k, form[k].trim()]));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/catalog/people/${encodeURIComponent(person.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changed) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ ok: false, text: out?.message ?? 'That didn’t save. Nothing was changed.' }); return; }
      setPerson(out);
      setForm({ name: out.name, type: out.type, ...Object.fromEntries(FIELDS.map((f) => [f, out[f] ?? ''])) } as Record<Field | 'name' | 'type', string>);
      setMsg({ ok: true, text: out.missing.length ? `Saved. Still missing: ${out.missing.join(', ')}.` : 'Saved. Everything the forms need is on file.' });
    } catch { setMsg({ ok: false, text: 'Couldn’t reach the server. Nothing was changed.' }); } finally { setBusy(false); }
  };
  const company = form.type === 'company';
  const group = form.type === 'group';
  return (
    <div className={s.single}>
      <p className={o.small}><Link href="/catalog/people" className={o.linkInline}>People</Link>{back && <> · <Link href={back} className={o.linkInline}>Back to {back.startsWith('/rights') ? 'Documents' : 'where you were'}</Link></>}</p>
      <div className={o.head}>
        <div><PageTitle>{person.name}</PageTitle><p className={o.sub}>What the rights forms need about {company ? 'this company' : group ? 'this group' : 'this person'}. Everything here stays private to your workspace and goes only onto forms you prepare.</p></div>
      </div>
      {person.missing.length > 0
        ? <p className={o.toast} role="note"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Missing for the forms: {person.missing.join(', ')}.</p>
        : <p className={o.toast} role="note"><Check size={16} className={o.good} aria-hidden="true" />Everything the forms need is on file.</p>}
      <form className={`${o.form} ${s.personForm}`} aria-label={`Details for ${person.name}`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset className={s.fieldset}>
          <legend className={s.legend}>Who they are</legend>
          <label className={o.field}>Name shown in your catalog<input className={o.input} value={form.name} maxLength={120} onChange={set('name')} required /></label>
          <label className={o.field}>Kind
            <select className={o.input} value={form.type} onChange={set('type')}><option value="person">A person</option><option value="group">A group or band</option><option value="company">A company (label, publisher)</option></select>
          </label>
          {!group && <label className={o.field}>Legal name <span className={o.hint}>{company ? 'As registered, like Vale Songs LLC.' : 'As on their ID. Forms use it in place of a stage name.'}</span><input className={o.input} value={form.legalName} maxLength={200} onChange={set('legalName')} autoComplete="off" /></label>}
        </fieldset>
        {!group && (
          <fieldset className={s.fieldset}>
            <legend className={s.legend}>Performing rights</legend>
            <label className={o.field}>PRO <span className={o.hint}>The organization that collects their performance royalties.</span>
              <select className={o.input} value={form.pro} onChange={set('pro')}>{PROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className={o.field}>IPI number <span className={o.hint}>9 to 11 digits, shown in their PRO account.</span><input className={o.input} value={form.ipi} inputMode="numeric" maxLength={11} onChange={set('ipi')} autoComplete="off" /></label>
            <label className={o.field}>ISNI <span className={o.hint}>Optional. 16 characters, from isni.org.</span><input className={o.input} value={form.isni} maxLength={19} onChange={set('isni')} autoComplete="off" /></label>
          </fieldset>
        )}
        <fieldset className={s.fieldset}>
          <legend className={s.legend}>Contact</legend>
          <label className={o.field}>Email<input className={o.input} type="email" value={form.email} maxLength={200} onChange={set('email')} autoComplete="off" /></label>
          <label className={o.field}>Phone<input className={o.input} type="tel" value={form.phone} maxLength={40} onChange={set('phone')} autoComplete="off" /></label>
          <label className={o.field}>Mailing address<textarea className={`${o.input} ${s.textarea}`} value={form.address} maxLength={300} rows={3} onChange={set('address')} autoComplete="off" /></label>
        </fieldset>
        {!group && (
          <fieldset className={s.fieldset}>
            <legend className={s.legend}>Country</legend>
            <label className={o.field}>Citizenship <span className={o.hint}>Two-letter code, like US. The Copyright Office asks for this or the home country.</span><input className={o.input} value={form.citizenship} maxLength={2} onChange={set('citizenship')} autoCapitalize="characters" autoComplete="off" /></label>
            <label className={o.field}>Home country <span className={o.hint}>Where they live, two letters.</span><input className={o.input} value={form.domicile} maxLength={2} onChange={set('domicile')} autoCapitalize="characters" autoComplete="off" /></label>
          </fieldset>
        )}
        <div className={o.formActions}>
          <Button type="submit" variant="primary" disabled={busy || !Object.keys(changed).length}>Save</Button>
          {back && <ButtonLink href={back}>Done, back to {back.startsWith('/rights') ? 'Documents' : 'where I was'}</ButtonLink>}
        </div>
        {msg && <p className={o.toast} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{msg.text}</p>}
      </form>
      <section aria-labelledby="uses-h" className={s.uses}>
        <h2 id="uses-h" className={o.eyebrow}>On your catalog</h2>
        {person.uses.length ? <ul>{person.uses.map((u) => <li key={u.text}><Link href={u.href} className={o.linkInline}>{u.text}</Link></li>)}</ul> : <p className={o.small}>Not on any song or recording yet.</p>}
      </section>
    </div>
  );
}

/** Someone already in the workspace, a new person or company by name, or nobody. */
export type PartyValue = { partyId: string } | { name: string } | null;

/** Pick someone in the workspace, or type a new name. */
export function PartyPicker({ label, hint, people, value, onChange, allowNone, noneLabel = 'Not set' }: {
  label: string; hint?: string; people: { id: string; name: string }[]; value: PartyValue; onChange: (v: PartyValue) => void; allowNone?: boolean; noneLabel?: string;
}) {
  const sel = value === null ? '' : 'partyId' in value ? value.partyId : '__new';
  return (
    <div className={s.picker}>
      <label className={o.field}>{label}{hint && <span className={o.hint}>{hint}</span>}
        <select className={o.input} value={sel} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === '__new' ? { name: '' } : { partyId: e.target.value })}>
          {(allowNone || sel === '') && <option value="">{noneLabel}</option>}
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="__new">Someone new…</option>
        </select>
      </label>
      {value && 'name' in value && (
        <label className={o.field}>Their name<input className={o.input} value={value.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} autoFocus /></label>
      )}
    </div>
  );
}
