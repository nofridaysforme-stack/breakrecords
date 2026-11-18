'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusPill, type Status } from '@/components/ui/Status';
import { Term } from '@/components/ui/Controls';
import { Money } from '@/components/ui/Money';
import { LinkTabs } from '@/components/ops/LinkTabs';
import type { getProfileClaims, getRegistrations, getUnclaimed } from '@/data/api';
import o from '@/components/ops/Ops.module.css';
import s from './Rights.module.css';

const LEGEND: Status[] = ['confirmed', 'submitted', 'needsYou', 'prepared', 'notStarted', 'blocked'];

export function RightsTabs() {
  return <LinkTabs label="Rights" tabs={[
    { label: 'Registrations', href: '/rights/registrations' },
    { label: 'Unclaimed money', href: '/rights/unclaimed' },
    { label: 'Profile claims', href: '/rights/claims' },
    { label: 'Documents', href: '/rights/documents' },
  ]} />;
}

function Legend() {
  return (
    <ul className={s.legend} aria-label="Status key">
      {LEGEND.map((st) => <li key={st}><StatusPill status={st} /></li>)}
    </ul>
  );
}

type Reg = Awaited<ReturnType<typeof getRegistrations>>;
type RegCell = Reg['rows'][number]['cells'][number];
const ORG_KEYS = ['pro', 'mlc', 'sx_owner', 'sx_artist', 'copyright', 'neighboring'] as const;
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * 5c. Recordings by registration, each cell a shape and a word. A cell opens a panel: where the
 * registration stands, its form, and the next step (prepare a filing, approve it, record it
 * submitted, record the confirmation and its number).
 */
export function RegistrationsView({ data: initial, unclaimed }: { data: Reg; unclaimed: number }) {
  const [data, setData] = useState(initial);
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const waiting = new Set(data.rows.flatMap((r) => r.cells.filter((c) => c.next === 'approve').map((c) => c.approvalId))).size;
  const open = (row: number, col: number) => { setSel({ row, col }); panel.current?.showModal(); };
  const cell = sel ? data.rows[sel.row].cells[sel.col] : null;
  return (
    <>
      <div className={`${o.head} ${s.head}`}>
        <div><PageTitle>Registrations</PageTitle><p className={o.sub}>Every place a recording or song needs to be registered so it gets paid. Choose a cell to file it or record where it stands. Rights is where you register and collect; the agreements behind it, publishing deals included, are in <Link href="/contracts" className={o.linkInline}>Contracts</Link>, and who gets what share is in <Link href="/splits" className={o.linkInline}>Splits</Link>.</p></div>
        <Legend />
      </div>
      <div className={s.matrixWrap} role="region" aria-label="Registrations by recording" tabIndex={0}>
        <table className={s.matrix}>
          <thead>
            <tr>
              <th scope="col">Recording</th>
              {data.columns.map((c) => (
                <th key={c.key} scope="col">{c.term ? <Term term={c.term}>{c.name}</Term> : c.name}<span className={s.colSub}>{c.sub}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, ri) => (
              <tr key={r.id}>
                <th scope="row"><span className={s.recName}>{r.name}</span><span className={s.recArtist}>{r.artist}</span></th>
                {r.cells.map((c, ci) => (
                  <td key={data.columns[ci].key}>
                    <button type="button" className={s.cellBtn} onClick={() => open(ri, ci)} aria-haspopup="dialog">
                      <span className="visually-hidden">{data.columns[ci].name} {data.columns[ci].sub} for {r.name}: </span>
                      <StatusPill status={c.status} label={c.label} />
                      {c.ref && <span className={s.ref}>{c.ref}</span>}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={o.callouts}>
        <section className={`${o.callout} ${waiting ? o.calloutCritical : ''}`} aria-labelledby="fil-h">
          <div className={o.calloutBody}>
            <h2 id="fil-h" className={o.calloutTitle}>{waiting ? <CircleAlert size={15} strokeWidth={2.5} className={o.critical} aria-hidden="true" /> : <Check size={15} className={o.good} aria-hidden="true" />}{waiting} {waiting === 1 ? 'filing waits' : 'filings wait'} on your approval</h2>
            <p className={o.calloutText}>Each filing is a card in Approvals with the facts to confirm. After you approve, submit it on the organization’s site and record it here.</p>
          </div>
          <ButtonLink href="/approvals" variant={waiting ? 'primary' : undefined} className={s.nowrap}>Open Approvals</ButtonLink>
        </section>
        <section className={o.callout} aria-labelledby="unc-h">
          <div className={o.calloutBody}>
            <h2 id="unc-h" className={o.calloutTitle}><Money cents={unclaimed} /> unclaimed found</h2>
            <p className={o.calloutText}>Societies are holding royalties that could be yours. Claim each one with a filing.</p>
          </div>
          <ButtonLink href="/rights/unclaimed" className={s.nowrap}>Start claim</ButtonLink>
        </section>
      </div>
      <dialog ref={panel} className={o.drawer} aria-labelledby="reg-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }} onClose={() => setSel(null)}>
        {sel && cell && (
          <RegPanel key={`${sel.row}:${sel.col}`} org={ORG_KEYS[sel.col]} column={data.columns[sel.col]} recording={data.rows[sel.row].name} cell={cell}
            onDone={(v) => setData(v)} onClose={() => panel.current?.close()} />
        )}
      </dialog>
    </>
  );
}

function RegPanel({ org, column, recording, cell, onDone, onClose }: { org: (typeof ORG_KEYS)[number]; column: Reg['columns'][number]; recording: string; cell: RegCell; onDone: (v: Reg) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [on, setOn] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [iswc, setIswc] = useState('');
  const t = cell.target;
  const send = async (body: object, ok: string) => {
    if (!t) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/rights/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org, subject: t.subject, id: t.id, ...body }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ ok: false, text: out?.message ?? 'That didn’t go through.' }); return; }
      onDone(out); setMsg({ ok: true, text: ok });
    } catch { setMsg({ ok: false, text: 'Couldn’t reach the server. Nothing changed.' }); } finally { setBusy(false); }
  };
  const what = `${column.name} (${column.sub})`;
  return (
    <>
      <div className={o.drawerHead}>
        <h2 id="reg-h" className={o.drawerTitle}>{what}</h2>
        <button type="button" className={o.iconBtn} aria-label="Close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <p className={o.small}>{t ? `${t.subject === 'work' ? 'Song' : 'Recording'}: ${t.title}` : `Recording: ${recording}`}</p>
      <p><StatusPill status={cell.status} label={cell.label} /></p>
      {cell.note && <p className={o.small}>{cell.note}</p>}
      <dl className={s.regFacts}>
        {cell.submittedOn && <><dt>Submitted</dt><dd>{cell.submittedOn}{cell.submitRef ? `, ${cell.submitRef}` : ''}</dd></>}
        {cell.ref && <><dt>{cell.refLabel ?? 'Reference'}</dt><dd>{cell.ref}</dd></>}
        {cell.confirmedOn && <><dt>Confirmed</dt><dd>{cell.confirmedOn}</dd></>}
      </dl>
      {cell.form ? <p className={o.small}>The filled-in form is in <Link href="/rights/documents" className={o.linkInline}>Rights › Documents</Link>. Prepare it again after fixing anything it says is missing.</p>
        : <p className={o.small}>There’s no prepared form for this yet. Register on the organization’s site, then record it here.</p>}
      {!t && <p className={o.small}>This recording isn’t linked to a song, so there’s nothing to register with {column.name} yet. Link it to a song in Catalog first.</p>}
      {t && cell.next === 'prepare' && (
        <div><Button variant="primary" disabled={busy} onClick={() => void send({ action: 'prepare' }, 'Filing prepared. It’s in Approvals with the facts to confirm.')}>Prepare filing</Button></div>
      )}
      {t && cell.next === 'approve' && cell.approvalId && (
        <p className={o.small}>The filing waits on your approval. <Link href={`/approvals/${cell.approvalId}`} className={o.linkInline}>Open the filing card</Link></p>
      )}
      {t && cell.next === 'submitted' && (
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); void send({ action: 'submitted', on, ...(reference.trim() ? { reference: reference.trim() } : {}) }, 'Recorded as submitted. The filing can no longer be undone.'); }}>
          <p className={o.small}>Approved. Submit it on the organization’s site with the prepared form, then record it here.</p>
          <label className={o.field}>Submitted on<input className={o.input} type="date" value={on} max={todayIso()} onChange={(e) => setOn(e.target.value)} required /></label>
          <label className={o.field}>Their reference <span className={o.hint}>Optional, for example a case or submission number.</span><input className={o.input} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></label>
          <div className={o.formActions}><Button type="submit" variant="primary" disabled={busy}>I submitted it</Button></div>
        </form>
      )}
      {t && cell.next === 'confirmed' && (
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); void send({ action: 'confirmed', reference: reference.trim(), on, ...(iswc.trim() ? { iswc: iswc.trim() } : {}) }, 'Confirmation recorded.'); }}>
          <p className={o.small}>When the organization confirms it, record their number here.</p>
          <label className={o.field}>{cell.refLabel ?? 'Registration number'}<input className={o.input} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} required /></label>
          <label className={o.field}>Confirmed on<input className={o.input} type="date" value={on} max={todayIso()} onChange={(e) => setOn(e.target.value)} /></label>
          {t.subject === 'work' && <label className={o.field}>ISWC <span className={o.hint}>Optional. If they gave the song one, it’s saved on the song.</span><input className={o.input} value={iswc} maxLength={20} placeholder="T-123.456.789-0" onChange={(e) => setIswc(e.target.value)} /></label>}
          <div className={o.formActions}><Button type="submit" variant="primary" disabled={busy || !reference.trim()}>Record the confirmation</Button></div>
        </form>
      )}
      {msg && <p className={o.toast} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{msg.text}</p>}
    </>
  );
}

/**
 * Rights > Unclaimed money. Each claim is a filing: prepare it (a card in Approvals), approve
 * it, submit it on the society's site and record that, then record what was paid, or that it
 * isn't yours.
 */
export function UnclaimedView({ data: initial }: { data: Awaited<ReturnType<typeof getUnclaimed>> }) {
  const [data, setData] = useState(initial);
  return (
    <>
      <div className={o.head}>
        <div><PageTitle>Unclaimed money</PageTitle><p className={o.sub}>Royalties collection societies are holding that could be yours. A claim is a filing, so each one comes to you first.</p></div>
        <div className={s.total}><span className={o.eyebrow}>Still to claim</span><span className={s.totalNum}><Money cents={data.total} /></span></div>
      </div>
      {data.items.length ? (
        <ul className={s.claims}>
          {data.items.map((u) => <ClaimCard key={u.id} u={u} onDone={setData} />)}
        </ul>
      ) : <p className={o.muted}>Nothing found yet.</p>}
      <p className={o.small}>Amounts are what each society reports; the final payment can differ slightly.</p>
    </>
  );
}

type Claim = Awaited<ReturnType<typeof getUnclaimed>>['items'][number];
function ClaimCard({ u, onDone }: { u: Claim; onDone: (v: Awaited<ReturnType<typeof getUnclaimed>>) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [on, setOn] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notOurs, setNotOurs] = useState(false);
  const send = async (body: object, ok: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/rights/unclaimed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: u.id, ...body }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ ok: false, text: out?.message ?? 'That didn’t go through.' }); return; }
      onDone(out); setMsg({ ok: true, text: ok }); setNotOurs(false);
    } catch { setMsg({ ok: false, text: 'Couldn’t reach the server. Nothing changed.' }); } finally { setBusy(false); }
  };
  const status: Status = u.next === null ? (u.label === 'Paid' ? 'confirmed' : 'notStarted') : u.next === 'approve' ? 'needsYou' : u.next === 'submitted' ? 'prepared' : u.next === 'resolve' ? 'submitted' : 'notStarted';
  const cents = Math.round(Number(amount || '0') * 100);
  return (
    <li className={s.claim} aria-labelledby={`cl-${u.id}`}>
      <div className={s.claimMain}>
        <div className={s.claimTop}><span className={o.eyebrow}>{u.source === 'MLC' ? <Term term="MLC" /> : u.source === 'SoundExchange' ? <Term term="SoundExchange" /> : u.source}</span><span className={s.claimAmount}><Money cents={u.amount} /></span></div>
        <h2 id={`cl-${u.id}`} className={s.claimTitle}>{u.what}</h2>
        <p className={o.text2} style={{ fontSize: 'var(--fs-body)', lineHeight: 1.5 }}>{u.why}</p>
        <p><StatusPill status={status} label={u.label} /></p>
        {u.note && <p className={o.small}>{u.note}</p>}
        <dl className={o.kv} style={{ gridTemplateColumns: '120px minmax(0, 1fr)' }}>
          <dt>Held since</dt><dd>{u.since}</dd>
          {u.submittedOn && <><dt>Claimed</dt><dd>{u.submittedOn}{u.submitRef ? `, ${u.submitRef}` : ''}</dd></>}
          {u.paid != null && <><dt>Paid</dt><dd><Money cents={u.paid} />{u.resolvedOn ? `, ${u.resolvedOn}` : ''}</dd></>}
          {u.resolution && <><dt>Not ours</dt><dd>{u.resolution}</dd></>}
        </dl>
        {u.next && u.steps && (
          <details className={s.steps}>
            <summary>How to claim it</summary>
            <ol>{u.steps.map((st) => <li key={st}>{st}</li>)}</ol>
          </details>
        )}
      </div>
      <div className={s.claimAct}>
        {u.next === 'prepare' && !notOurs && <Button variant="primary" disabled={busy} onClick={() => void send({ action: 'prepare' }, 'Claim prepared. It’s in Approvals with the facts to confirm.')}>Prepare claim</Button>}
        {u.next === 'approve' && u.approvalId && <ButtonLink href={`/approvals/${u.approvalId}`}>Open the claim card</ButtonLink>}
        {u.next === 'submitted' && (
          <form className={o.form} aria-label={`Record the claim for ${u.what}`} onSubmit={(e) => { e.preventDefault(); void send({ action: 'submitted', on, ...(reference.trim() ? { reference: reference.trim() } : {}) }, 'Recorded as submitted. The claim can no longer be undone.'); }}>
            <label className={o.field}>Submitted on<input className={o.input} type="date" value={on} max={todayIso()} onChange={(e) => setOn(e.target.value)} required /></label>
            <label className={o.field}>Their reference <span className={o.hint}>Optional.</span><input className={o.input} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></label>
            <Button type="submit" variant="primary" disabled={busy}>I submitted the claim</Button>
          </form>
        )}
        {u.next === 'resolve' && !notOurs && (
          <form className={o.form} aria-label={`Record the payment for ${u.what}`} onSubmit={(e) => { e.preventDefault(); void send({ action: 'paid', amount: cents, on }, 'Payment recorded. The claim is closed.'); }}>
            <label className={o.field}>Amount received ($)<input className={o.input} inputMode="decimal" value={amount} maxLength={12} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
            <label className={o.field}>Paid on<input className={o.input} type="date" value={on} max={todayIso()} onChange={(e) => setOn(e.target.value)} /></label>
            <Button type="submit" variant="primary" disabled={busy || cents <= 0}>Record the payment</Button>
          </form>
        )}
        {(u.next === 'prepare' || u.next === 'resolve') && (notOurs ? (
          <form className={o.form} aria-label={`Not ours: ${u.what}`} onSubmit={(e) => { e.preventDefault(); void send({ action: 'dismissed', reason: reason.trim() }, 'Marked as not yours. It stays on the list as closed.'); }}>
            <label className={o.field}>Why it isn’t yours<input className={o.input} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
            <span style={{ display: 'flex', gap: 8 }}><Button type="submit" disabled={busy || !reason.trim()}>Mark as not ours</Button><Button onClick={() => setNotOurs(false)}>Cancel</Button></span>
          </form>
        ) : <Button size="sm" onClick={() => setNotOurs(true)}>Not ours</Button>)}
        {msg && <p className={o.toast} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{msg.text}</p>}
      </div>
    </li>
  );
}

/** Rights > Profile claims (undrawn): artist profiles on each service. */
export function ClaimsView({ data }: { data: Awaited<ReturnType<typeof getProfileClaims>> }) {
  const [rows, setRows] = useState(data.rows);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Saves on the server, so the prepared claims stay prepared after a reload. */
  const prepare = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/rights/claims/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.message ?? 'That didn’t go through. Nothing was changed.'); return; }
      setRows(json.rows); setAsked(true);
    } catch { setError('Couldn’t reach the server. Nothing was changed.'); } finally { setBusy(false); }
  };
  const left = rows.reduce((n, r) => n + r.cells.filter((c) => c.status === 'notStarted').length, 0);
  return (
    <>
      <div className={`${o.head} ${s.head}`}>
        <div><PageTitle>Profile claims</PageTitle><p className={o.sub}>Verified artist profiles let you update photos and bios and see listener data.</p></div>
        <Legend />
      </div>
      <div className={s.matrixWrap} role="region" aria-label="Profile claims by artist" tabIndex={0}>
        <table className={s.matrix}>
          <thead><tr><th scope="col">Artist</th>{data.services.map((sv) => <th key={sv} scope="col">{sv}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.artist}>
                <th scope="row"><span className={s.recName}>{r.artist}</span></th>
                {r.cells.map((cell, i) => <td key={data.services[i]}><StatusPill status={cell.status} />{cell.ref && <span className={s.ref}>{cell.ref}</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}
      <div className={o.callouts}>
        <section className={o.callout} aria-labelledby="pc-h">
          <div className={o.calloutBody}>
            <h2 id="pc-h" className={o.calloutTitle}>{asked ? 'Rights Agent is preparing them' : `${left} claims not started`}</h2>
            <p className={o.calloutText}>{asked ? 'Each one is prepared for the artist to confirm by email. Nothing is posted publicly.' : 'Rights Agent can prepare each one. The artist confirms by email.'}</p>
          </div>
          {!asked && left > 0 && <Button onClick={prepare} disabled={busy} className={s.nowrap}>Prepare the rest</Button>}
        </section>
      </div>
    </>
  );
}
