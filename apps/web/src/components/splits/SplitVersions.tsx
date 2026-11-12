'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert, Plus, X } from 'lucide-react';
import type { SplitVersionsResponse } from '@breakrecords/contract';
import { deriveShares, type DealTerms } from '@breakrecords/core/dealSplit';
import { formatPercent } from '@breakrecords/core/percent';
import { lineAmounts, type SplitRole } from '@breakrecords/core/splitVersions';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { RiskFlag } from '@/components/ui/Status';
import o from '@/components/ops/Ops.module.css';

type Data = SplitVersionsResponse;
type Person = { id: string; name: string };
type Row = { role: 'artist' | 'producer' | 'feature'; pick: string; name: string; share: string };
type Line = Data['current'] extends infer V ? (V extends { lines: (infer L)[] } ? L : never) : never;

const ROLE: Record<SplitRole, string> = { artist: 'Artist', label: 'Label', producer: 'Producer', feature: 'Featured artist' };
const toPct = (bp: number) => String(bp / 100);
const toBp = (s: string) => Math.round(Number(s || '0') * 100);
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const rowsOf = (lines: Line[]): Row[] => lines.filter((l) => l.role !== 'label').map((l) => ({ role: l.role as Row['role'], pick: l.partyId, name: '', share: toPct(l.shareBp) }));

/**
 * A split's versions: the one in effect, and the open one (a draft you can change, or out for
 * signatures). Each person signs their own line; the last signature puts it in effect. Below,
 * the songwriters of the release's songs, which each writer confirms.
 */
export function SplitVersions({ data: initial, people }: { data: Data; people: Person[] }) {
  const [d, setD] = useState(initial);
  const open = d.open;
  const draft = open?.status === 'draft';
  const [rows, setRows] = useState<Row[]>(open ? rowsOf(open.lines) : []);
  const [form, setForm] = useState(open ? { points: toPct(open.terms.producerBp), artist: toPct(open.terms.artistOfNetBp), feature: toPct(open.terms.featureOfArtistBp) } : { points: '0', artist: '50', feature: '0' });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const reset = (next: Data) => {
    setD(next);
    if (next.open) {
      setRows(rowsOf(next.open.lines));
      setForm({ points: toPct(next.open.terms.producerBp), artist: toPct(next.open.terms.artistOfNetBp), feature: toPct(next.open.terms.featureOfArtistBp) });
    }
  };
  async function call(url: string, method: string, body: object | null, ok: string) {
    setError(null); setNote(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That didn’t go through.'); return false; }
      const fresh = out && 'node' in out && 'songs' in out ? out : await (await fetch(`/api/splits/${encodeURIComponent(d.node)}/versions`)).json();
      reset(fresh); setNote(ok);
      return true;
    } catch { setError('Couldn’t reach the server. Nothing changed.'); return false; }
  }
  async function invite(partyId: string, name: string) {
    setError(null); setNote(null);
    try {
      const res = await fetch('/api/settings/invites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role: 'payee', payeeId: partyId }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'The invitation wasn’t sent.'); return; }
      setInviting(null); setEmail('');
      const mark = <T extends { partyId: string; canSignIn: boolean }>(xs: T[]) => xs.map((x) => (x.partyId === partyId ? { ...x, canSignIn: true } : x));
      setD({ ...d, ...(d.open ? { open: { ...d.open, lines: mark(d.open.lines) } } : {}), songs: d.songs.map((s) => ({ ...s, writers: mark(s.writers) })) });
      setNote(`Invitation sent to ${name}. They sign in their own portal.`);
    } catch { setError('Couldn’t reach the server. Nothing was sent.'); }
  }

  const has = (r: Row['role']) => rows.some((x) => x.role === r);
  const terms: DealTerms = open && draft
    ? { producerBp: has('producer') ? toBp(form.points) : 0, artistOfNetBp: toBp(form.artist), labelOfNetBp: 10000 - toBp(form.artist), featureOfArtistBp: has('feature') ? toBp(form.feature) : 0 }
    : open?.terms ?? { producerBp: 0, artistOfNetBp: 5000, labelOfNetBp: 5000, featureOfArtistBp: 0 };
  const label = open?.lines.find((l) => l.role === 'label');
  const draftLines = [{ role: 'label' as SplitRole, party: label?.partyId ?? 'label', shareBp: 10000 }, ...rows.map((r, i) => ({ role: r.role, party: r.pick === 'new' ? `new-${i}` : r.pick, shareBp: toBp(r.share) }))];
  const preview = lineAmounts(terms, draftLines);
  const nameOf = (r: Row) => (r.pick === 'new' ? r.name || 'New person' : people.find((p) => p.id === r.pick)?.name ?? open?.lines.find((l) => l.partyId === r.pick)?.name ?? r.pick);
  const sumOf = (role: Row['role']) => rows.filter((r) => r.role === role).reduce((a, r) => a + toBp(r.share), 0);
  const rolesOk = (['artist', 'producer', 'feature'] as const).every((r) => !has(r) || sumOf(r) === 10000) && has('artist') && rows.every((r) => r.pick !== 'new' || r.name.trim());
  const changed = !!open && draft && (JSON.stringify(rowsOf(open.lines)) !== JSON.stringify(rows)
    || (['producerBp', 'labelOfNetBp', 'artistOfNetBp', 'featureOfArtistBp'] as const).some((k) => terms[k] !== open.terms[k]));
  const linesBody = rows.map((r) => ({ role: r.role, party: r.pick === 'new' ? { name: r.name.trim() } : { partyId: r.pick }, shareBp: toBp(r.share) }));

  const signCell = (l: Line, sent: boolean) => l.signed ? <span className={o.good}><Check size={14} aria-hidden="true" /> Signed {l.signed}</span>
    : !sent ? <span className={o.muted}>After it’s sent</span>
    : l.canSign ? <Button size="sm" variant="primary" onClick={() => void call(`/api/splits/${encodeURIComponent(d.node)}/sign`, 'POST', { role: l.role, partyId: l.partyId }, `Signed as ${ROLE[l.role].toLowerCase()}.`)}>Sign as {ROLE[l.role].toLowerCase()}<span className="visually-hidden"> for {l.name}</span></Button>
    : l.canSignIn ? <span className={o.muted}>Waiting on {l.name.split(' ')[0]}</span>
    : inviteCell(l.partyId, l.name, `${l.role}-${l.partyId}`);
  const inviteCell = (partyId: string, name: string, key: string) => !d.canEdit ? <span className={o.muted}>Waiting on {name.split(' ')[0]}</span>
    : inviting === key ? (
      <form style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) void invite(partyId, name); }}>
        <label className="visually-hidden" htmlFor={`invite-${key}`}>{name}’s email</label>
        <input id={`invite-${key}`} className={o.input} style={{ height: 36, width: 200 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their email" autoFocus />
        <Button size="sm" type="submit" disabled={!email.includes('@')} disabledReason="Enter their email.">Send invitation</Button>
      </form>)
    : <Button size="sm" onClick={() => { setInviting(key); setEmail(''); }}>Invite {name.split(' ')[0]} to sign</Button>;

  const table = (lines: Line[], caption: string, sent: boolean) => (
    <div className={o.tableWrap} role="region" aria-label={caption} tabIndex={0}>
      <table className={o.table}>
        <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">From every $100</th><th scope="col">Signature</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.role}-${l.partyId}`}>
              <th scope="row">{l.name}</th>
              <td className={o.text}>{ROLE[l.role]}{l.shareBp !== 10000 ? ` · ${formatPercent(l.shareBp)} of it` : ''}</td>
              <td className={o.cellMono}>{money(l.amount)}</td>
              <td>{signCell(l, sent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className={o.crumb}><Link href="/splits">Splits</Link> / {d.breadcrumb.join(' / ')}</nav>
      <div className={o.head}>
        <div>
          <PageTitle>{d.title}: who gets what</PageTitle>
          <p className={o.sub}>
            {d.current ? `Version ${d.current.version} in effect since ${d.current.effective}` : 'Not in effect yet'}
            {open ? ` · version ${open.version} ${draft ? 'is a draft' : `is out for signatures, ${open.lines.filter((l) => l.signed).length} of ${open.lines.length} signed`}` : ''}
          </p>
        </div>
        <RiskFlag risk={open ? (draft ? 'dueSoon' : 'needsEyes') : 'low'} label={open ? (draft ? 'Draft' : 'Waiting on signatures') : 'In effect'} />
      </div>

      {d.current && (
        <section className={o.section} aria-labelledby="in-effect">
          <h2 id="in-effect" className={o.sectionTitle}>In effect: version {d.current.version}</h2>
          {table(d.current.lines, `Version ${d.current.version}, in effect`, true)}
          {!open && d.canEdit && <div><Button onClick={() => void call(`/api/splits/${encodeURIComponent(d.node)}/versions`, 'POST', {}, `Version ${d.current!.version + 1} started as a draft. Change it, then send it to sign.`)}>Propose a change</Button></div>}
          {!open && <p className={o.hint}>Changing a split makes a new version. This one keeps paying until everyone signs the new one.</p>}
        </section>
      )}

      {open && (
        <section className={o.section} aria-labelledby="open-version">
          <h2 id="open-version" className={o.sectionTitle}>Version {open.version}: {draft ? 'draft' : 'out for signatures'}</h2>
          {table(open.lines, `Version ${open.version}`, !draft)}
          {draft && d.canEdit && (
            <form className={o.form} style={{ maxWidth: 640 }} onSubmit={(e) => { e.preventDefault(); void call(`/api/splits/${encodeURIComponent(d.node)}/draft`, 'PUT', { terms, lines: linesBody }, 'Draft saved.'); }}>
              <fieldset className={o.form} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={o.field}>People and their shares of each role</legend>
                {rows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className={o.field} style={{ flex: '1 1 130px' }}><label htmlFor={`role-${i}`}>Role</label>
                      <select id={`role-${i}`} className={o.input} value={r.role} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value as Row['role'] } : x)))}>
                        <option value="artist">Artist</option><option value="producer">Producer</option><option value="feature">Featured artist</option>
                      </select></div>
                    <div className={o.field} style={{ flex: '2 1 170px' }}><label htmlFor={`who-${i}`}>Person</label>
                      <select id={`who-${i}`} className={o.input} value={r.pick} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: e.target.value } : x)))}>
                        {!people.some((p) => p.id === r.pick) && r.pick !== 'new' && <option value={r.pick}>{nameOf(r)}</option>}
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        <option value="new">Someone new</option>
                      </select></div>
                    {r.pick === 'new' && <label className={o.field} style={{ flex: '2 1 160px' }}>Name<input className={o.input} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={120} /></label>}
                    <label className={o.field} style={{ flex: '0 1 110px' }}>Share of role (%)<input className={o.input} inputMode="decimal" value={r.share} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, share: e.target.value.replace(/[^\d.]/g, '') } : x)))} maxLength={6} /></label>
                    <button type="button" className={o.iconBtn} aria-label={`Remove ${nameOf(r)}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
                  </div>
                ))}
                <div><Button size="sm" onClick={() => setRows([...rows, { role: 'producer', pick: people[0]?.id ?? 'new', name: '', share: '100' }])}><Plus size={14} aria-hidden="true" />Add a person</Button></div>
                {(['artist', 'producer', 'feature'] as const).filter(has).map((r) => sumOf(r) !== 10000 && <p key={r} className={o.warnText} role="note">The {r === 'feature' ? 'featured artists’' : `${r}s’`} shares add up to {formatPercent(sumOf(r))}. They need to total 100%.</p>)}
              </fieldset>
              <label className={o.field}>Artists’ share of net profit (%)<input className={o.input} inputMode="decimal" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value.replace(/[^\d.]/g, '') })} maxLength={6} />
                <span className={o.hint}>The label gets {formatPercent(terms.labelOfNetBp)}.</span></label>
              {has('producer') && <label className={o.field}>Producer points (% of all income, shared by the producers)<input className={o.input} inputMode="decimal" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value.replace(/[^\d.]/g, '') })} maxLength={5} /></label>}
              {has('feature') && <label className={o.field}>Featured artists’ cut of the artist share (%)<input className={o.input} inputMode="decimal" value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value.replace(/[^\d.]/g, '') })} maxLength={6} /></label>}
              <div className={o.card} aria-live="polite">
                <p className={o.cardTitle}>From every $100, with these changes</p>
                <ul className={o.text} style={{ margin: 0, paddingLeft: 18 }}>
                  <li>{label?.name ?? 'Label'}: {money(preview[0])}</li>
                  {rows.map((r, i) => <li key={i}>{nameOf(r)} ({ROLE[r.role].toLowerCase()}): {money(preview[i + 1])}</li>)}
                </ul>
                {deriveShares(terms).gapOfNetBp !== 0 && <p className={o.warnText}>Net profit isn’t fully assigned.</p>}
              </div>
              <div className={o.formActions}>
                <Button type="submit" disabled={!changed || !rolesOk} disabledReason="Change something, with each role’s shares totalling 100%.">Save draft</Button>
                <Button variant="primary" disabled={changed} disabledReason="Save your changes first." onClick={() => void call(`/api/splits/${encodeURIComponent(d.node)}/send`, 'POST', {}, 'Sent. Everyone on the split can now sign.')}>Send for signatures</Button>
              </div>
              <p className={o.hint}>Once sent, it can’t change. {d.current ? `Version ${d.current.version} keeps paying until everyone signs.` : 'Payouts from this release wait until everyone has signed.'}</p>
            </form>
          )}
        </section>
      )}

      {d.releaseId && <Songwriters d={d} people={people} call={call} inviteCell={inviteCell} />}
      {note && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{note}</p>}
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not done. {error}</p>}
    </>
  );
}

type WRow = { pick: string; name: string; share: string };
/** Songwriter splits: who wrote each song on the release and their shares (100% in all). Each writer confirms their own. */
function Songwriters({ d, people, call, inviteCell }: {
  d: Data; people: Person[];
  call: (url: string, method: string, body: object | null, ok: string) => Promise<boolean>;
  inviteCell: (partyId: string, name: string, key: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [rows, setRows] = useState<WRow[]>([]);
  const total = rows.reduce((a, r) => a + toBp(r.share), 0);
  const ok = rows.length > 0 && total === 10000 && rows.every((r) => r.pick !== 'new' || r.name.trim());
  return (
    <section className={o.section} aria-labelledby="writers">
      <h2 id="writers" className={o.sectionTitle}>Songwriters</h2>
      <p className={o.text}>Who wrote each song, and their share of its publishing income. Each writer confirms their own share; changing the writers asks everyone again.</p>
      {d.songs.map((s) => (
        <article key={s.recordingId} className={o.card} aria-labelledby={`song-${s.recordingId}`}>
          <h3 id={`song-${s.recordingId}`} className={o.cardTitle}>{s.title}</h3>
          {editing === s.recordingId ? (
            <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (ok) void call(`/api/catalog/recordings/${encodeURIComponent(s.recordingId)}/writers`, 'PUT', { writers: rows.map((r) => ({ party: r.pick === 'new' ? { name: r.name.trim() } : { partyId: r.pick }, shareBp: toBp(r.share) })) }, `${s.title}’s songwriters saved. Each writer confirms their share.`).then((done) => { if (done) setEditing(null); }); }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className={o.field} style={{ flex: '2 1 170px' }}><label htmlFor={`w-${s.recordingId}-${i}`}>Writer</label>
                    <select id={`w-${s.recordingId}-${i}`} className={o.input} value={r.pick} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: e.target.value } : x)))}>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      <option value="new">Someone new</option>
                    </select></div>
                  {r.pick === 'new' && <label className={o.field} style={{ flex: '2 1 160px' }}>Name<input className={o.input} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={120} /></label>}
                  <label className={o.field} style={{ flex: '0 1 110px' }}>Share (%)<input className={o.input} inputMode="decimal" value={r.share} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, share: e.target.value.replace(/[^\d.]/g, '') } : x)))} maxLength={6} /></label>
                  {rows.length > 1 && <button type="button" className={o.iconBtn} aria-label={`Remove writer ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>}
                </div>
              ))}
              <div><Button size="sm" onClick={() => setRows([...rows, { pick: 'new', name: '', share: '' }])}><Plus size={14} aria-hidden="true" />Add a writer</Button></div>
              {total !== 10000 && <p className={o.warnText} role="note">Shares add up to {formatPercent(total)}. They need to total 100%.</p>}
              <div className={o.formActions}>
                <Button type="submit" variant="primary" disabled={!ok} disabledReason="Name every writer, with shares totalling 100%.">Save songwriters</Button>
                <Button onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              {s.writers.length === 0 ? <p className={o.text}>No writers yet.</p> : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {s.writers.map((w) => (
                    <li key={w.partyId} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <span><strong>{w.name}</strong> <span className={o.cellMono}>{formatPercent(w.shareBp)}</span></span>
                      {w.confirmed ? <span className={o.good}><Check size={14} aria-hidden="true" /> Confirmed</span>
                        : w.canConfirm ? <Button size="sm" variant="primary" onClick={() => void call(`/api/catalog/recordings/${encodeURIComponent(s.recordingId)}/writers/confirm`, 'POST', {}, 'Your share is confirmed.')}>Confirm my share</Button>
                        : w.canSignIn ? <span className={o.muted}>Waiting on {w.name.split(' ')[0]}</span>
                        : inviteCell(w.partyId, w.name, `writer-${s.recordingId}-${w.partyId}`)}
                    </li>
                  ))}
                </ul>
              )}
              {d.canEdit && <div><Button size="sm" onClick={() => { setEditing(s.recordingId); setRows(s.writers.length ? s.writers.map((w) => ({ pick: w.partyId, name: '', share: toPct(w.shareBp) })) : [{ pick: people[0]?.id ?? 'new', name: '', share: '100' }]); }}>{s.writers.length ? 'Change songwriters' : 'Add songwriters'}<span className="visually-hidden"> for {s.title}</span></Button></div>}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
