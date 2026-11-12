'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { FirstSplitResponse } from '@breakrecords/contract';
import { deriveShares, type DealTerms } from '@breakrecords/core/dealSplit';
import { formatPercent } from '@breakrecords/core/percent';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { RiskFlag } from '@/components/ui/Status';
import o from '@/components/ops/Ops.module.css';

const ROLE = { artist: 'Artist', label: 'Label', producer: 'Producer', feature: 'Featured artist' } as const;
const toPct = (bp: number) => String(bp / 100);
const toBp = (s: string) => Math.round(Number(s || '0') * 100);

/**
 * A split's first version while it's being agreed. As a draft the label can change the shares;
 * sending it asks everyone on it to sign; the last signature puts it in effect.
 */
export function FirstSplit({ data: initial }: { data: FirstSplitResponse }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [form, setForm] = useState({ points: toPct(initial.terms.producerBp), artist: toPct(initial.terms.artistOfNetBp), feature: toPct(initial.terms.featureOfArtistBp) });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const has = (r: string) => d.parties.some((p) => p.role === r);
  const draft = d.status === 'draft';
  const terms: DealTerms = draft
    ? { producerBp: has('producer') ? toBp(form.points) : 0, artistOfNetBp: toBp(form.artist), labelOfNetBp: 10000 - toBp(form.artist), featureOfArtistBp: has('feature') ? toBp(form.feature) : 0 }
    : d.terms;
  const shares = deriveShares(terms);
  const changed = draft && (['producerBp', 'labelOfNetBp', 'artistOfNetBp', 'featureOfArtistBp'] as const).some((k) => terms[k] !== d.terms[k]);

  async function call(path: string, method: string, body: object, ok: string) {
    setError(null); setNote(null);
    try {
      const res = await fetch(`/api/splits/${encodeURIComponent(d.node)}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That didn’t go through.'); return; }
      // The last signature puts it in effect: the regular split view takes over.
      if (!out || !('parties' in out) || !Array.isArray(out.parties)) { router.refresh(); return; }
      setD(out); setNote(ok);
    } catch { setError('Couldn’t reach the server. Nothing changed.'); }
  }
  async function invite(partyId: string, name: string) {
    setError(null); setNote(null);
    try {
      const res = await fetch('/api/settings/invites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role: 'payee', payeeId: partyId }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'The invitation wasn’t sent.'); return; }
      setInviting(null); setEmail('');
      setD({ ...d, parties: d.parties.map((p) => (p.partyId === partyId ? { ...p, canSignIn: true } : p)) });
      setNote(`Invitation sent to ${name}. They sign in their own portal.`);
    } catch { setError('Couldn’t reach the server. Nothing was sent.'); }
  }

  const signedN = d.parties.filter((p) => p.signed).length;
  return (
    <>
      <nav aria-label="Breadcrumb" className={o.crumb}><Link href="/splits">Splits</Link> / {d.breadcrumb.join(' / ')}</nav>
      <div className={o.head}>
        <div>
          <PageTitle>{d.title}: who gets what</PageTitle>
          <p className={o.sub}>Version {d.version} · {draft ? 'draft, not sent yet' : `out for signatures, ${signedN} of ${d.parties.length} signed`} · effective {d.effective}</p>
        </div>
        <RiskFlag risk={draft ? 'dueSoon' : 'needsEyes'} label={draft ? 'Draft' : 'Waiting on signatures'} />
      </div>

      <div className={o.tableWrap} role="region" aria-label="Who gets what" tabIndex={0}>
        <table className={o.table}>
          <thead><tr><th scope="col">Party</th><th scope="col">Role</th><th scope="col">From every $100</th><th scope="col">Signature</th></tr></thead>
          <tbody>
            {d.parties.map((p) => (
              <tr key={p.role}>
                <th scope="row">{p.name}</th>
                <td className={o.text}>{ROLE[p.role]}</td>
                <td className={o.cellMono}>${(shares[p.role] / 100).toFixed(2)}</td>
                <td>
                  {p.signed ? <span className={o.good}><Check size={14} aria-hidden="true" /> Signed {p.signed}</span>
                    : draft ? <span className={o.muted}>After it’s sent</span>
                    : p.canSign ? <Button size="sm" variant="primary" onClick={() => void call('sign', 'POST', { role: p.role }, `Signed as ${ROLE[p.role].toLowerCase()}.`)}>Sign as {ROLE[p.role].toLowerCase()}<span className="visually-hidden"> for {p.name}</span></Button>
                    : p.canSignIn ? <span className={o.muted}>Waiting on {p.name.split(' ')[0]}</span>
                    : inviting === p.partyId ? (
                      <form style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) void invite(p.partyId, p.name); }}>
                        <label className="visually-hidden" htmlFor={`invite-${p.role}`}>{p.name}’s email</label>
                        <input id={`invite-${p.role}`} className={o.input} style={{ height: 36, width: 200 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their email" autoFocus />
                        <Button size="sm" type="submit" disabled={!email.includes('@')} disabledReason="Enter their email.">Send invitation</Button>
                      </form>
                    )
                    : <Button size="sm" onClick={() => { setInviting(p.partyId); setEmail(''); }}>Invite {p.name.split(' ')[0]} to sign</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <section className={o.section} aria-labelledby="edit-draft">
          <h2 id="edit-draft" className={o.sectionTitle}>Change the draft</h2>
          <form className={o.form} style={{ maxWidth: 480 }} onSubmit={(e) => { e.preventDefault(); void call('draft', 'PUT', { terms }, 'Draft saved.'); }}>
            <label className={o.field}>Artist’s share of net profit (%)<input className={o.input} inputMode="decimal" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value.replace(/[^\d.]/g, '') })} maxLength={6} />
              <span className={o.hint}>The label gets {formatPercent(terms.labelOfNetBp)}.</span></label>
            {has('producer') && <label className={o.field}>Producer points (% of all income)<input className={o.input} inputMode="decimal" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value.replace(/[^\d.]/g, '') })} maxLength={5} /></label>}
            {has('feature') && <label className={o.field}>Featured artist’s cut of the artist share (%)<input className={o.input} inputMode="decimal" value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value.replace(/[^\d.]/g, '') })} maxLength={6} /></label>}
            <div className={o.formActions}>
              <Button type="submit" disabled={!changed}>Save draft</Button>
              <Button variant="primary" disabled={changed} disabledReason="Save your changes first." onClick={() => void call('send', 'POST', {}, 'Sent. Everyone on the split can now sign.')}>Send for signatures</Button>
            </div>
          </form>
          <p className={o.hint}>Once sent, the shares can’t change. Payouts from this release wait until everyone has signed.</p>
        </section>
      )}
      {note && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{note}</p>}
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not done. {error}</p>}
    </>
  );
}
