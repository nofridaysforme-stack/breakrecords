'use client';

import { useState } from 'react';
import { CircleAlert, Copy } from 'lucide-react';
import type { InviteCodesResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Status';
import o from '@/components/ops/Ops.module.css';
import s from './InviteCodes.module.css';

const STATUS = {
  active: { status: 'prepared', label: 'Active' },
  used_up: { status: 'confirmed', label: 'Used up' },
  expired: { status: 'notStarted', label: 'Expired' },
  revoked: { status: 'blocked', label: 'Revoked' },
} as const;

/** Make invite codes, see who signed up with each, and revoke them. */
export function InviteCodesView({ initial, signUpUrl }: { initial: InviteCodesResponse; signUpUrl: string }) {
  const [codes, setCodes] = useState(initial.codes);
  const [note, setNote] = useState('');
  const [uses, setUses] = useState('1');
  const [days, setDays] = useState('30');
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (url: string, init: RequestInit) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.message ?? 'That didn’t go through. Nothing was changed.'); return null; }
      setCodes(json.codes);
      return json;
    } catch { setError('Couldn’t reach the server. Nothing was changed.'); return null; } finally { setBusy(false); }
  };

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    const json = await send('/api/admin/invite-codes', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note, maxUses: Number(uses), expiresInDays: days === 'never' ? null : Number(days) }) });
    if (json) { setMade(json.code); setNote(''); setCopied(''); }
  };
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); } };
  const link = made ? `${signUpUrl}?code=${encodeURIComponent(made)}` : '';

  return (
    <>
      <div className={o.head}>
        <div>
          <PageTitle>Invite codes</PageTitle>
          <p className={o.sub}>Indie SRVCS is invite-only. Give someone a code and they sign up at {signUpUrl || '/sign-up'} with their own email. Their first sign-in creates their workspace.</p>
        </div>
      </div>

      <form className={s.form} onSubmit={make}>
        <label className={s.field}>Who it’s for
          <input className={s.input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} required placeholder="Kesi Vale, solo artist" />
        </label>
        <label className={s.field}>Uses
          <input className={s.input} type="number" min={1} max={1000} value={uses} onChange={(e) => setUses(e.target.value)} required />
        </label>
        <label className={s.field}>Expires
          <select className={s.input} value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">In 7 days</option><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="never">Never</option>
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || !note.trim()}>Make a code</Button>
      </form>

      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}

      {made && (
        <section className={s.made} aria-labelledby="made-h">
          <h2 id="made-h" className={s.madeTitle}>New code</h2>
          <p className={s.code}>{made}</p>
          <p className={s.muted}>Copy it now: it’s shown only once. Send the link, or the code with the address of the sign-up page.</p>
          <div className={s.copyRow}>
            <Button onClick={() => copy(made, 'code')}><Copy size={14} aria-hidden="true" /> Copy code</Button>
            {signUpUrl && <Button onClick={() => copy(link, 'link')}><Copy size={14} aria-hidden="true" /> Copy sign-up link</Button>}
            <span role="status" className={s.muted}>{copied && `Copied the ${copied}.`}</span>
          </div>
        </section>
      )}

      <div className={s.tableWrap} role="region" aria-label="Invite codes" tabIndex={0}>
        <table className={s.table}>
          <thead><tr><th scope="col">For</th><th scope="col">Ends in</th><th scope="col">Used</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Signed up</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {codes.length === 0 && <tr><td colSpan={7} className={s.muted}>No codes yet.</td></tr>}
            {codes.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.note}<span className={s.muted}> · {c.created}</span></th>
                <td className={s.mono}>…{c.hint}</td>
                <td className={s.mono}>{c.uses} of {c.maxUses}</td>
                <td>{c.expires ?? 'Never'}</td>
                <td><StatusPill status={STATUS[c.status].status} label={STATUS[c.status].label} /></td>
                <td>{c.signedUp.length ? c.signedUp.join(', ') : <span className={s.muted}>Nobody yet</span>}</td>
                <td>{c.status === 'active' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => send(`/api/admin/invite-codes?id=${c.id}`, { method: 'DELETE' })} aria-label={`Revoke the code for ${c.note}`}>Revoke</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
