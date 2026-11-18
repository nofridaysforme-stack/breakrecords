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
import { useDecisions } from '@/data/decisions';
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

/** Rights > Unclaimed money (undrawn). Each claim is a filing, so it becomes an approval. */
export function UnclaimedView({ data }: { data: Awaited<ReturnType<typeof getUnclaimed>> }) {
  const { propose, proposals, decisions } = useDecisions();
  return (
    <>
      <div className={o.head}>
        <div><PageTitle>Unclaimed money</PageTitle><p className={o.sub}>Royalties collection societies are holding for you. A claim is a filing, so each one comes to you first.</p></div>
        <div className={s.total}><span className={o.eyebrow}>Found</span><span className={s.totalNum}><Money cents={data.total} /></span></div>
      </div>
      <ul className={s.claims}>
        {data.items.map((u) => {
          const pid = `claim_${u.id}`;
          const proposed = proposals.some((p) => p.id === pid);
          const decided = decisions[pid]?.status;
          const viaFiling = u.source === 'MLC';
          return (
            <li key={u.id} className={s.claim}>
              <div className={s.claimMain}>
                <div className={s.claimTop}><span className={o.eyebrow}>{u.source === 'MLC' ? <Term term="MLC" /> : <Term term="SoundExchange" />}</span><span className={s.claimAmount}><Money cents={u.amount} /></span></div>
                <h2 className={s.claimTitle}>{u.what}</h2>
                <p className={o.text2} style={{ fontSize: 'var(--fs-body)', lineHeight: 1.5 }}>{u.why}</p>
                <dl className={o.kv} style={{ gridTemplateColumns: '120px minmax(0, 1fr)' }}>
                  <dt>Held since</dt><dd>{u.since}</dd>
                  <dt>How to claim</dt><dd>{u.claim}</dd>
                </dl>
              </div>
              <div className={s.claimAct}>
                {viaFiling ? (
                  <ButtonLink href="/approvals/apr_mlc">Open MLC filing</ButtonLink>
                ) : proposed ? (
                  <p className={`${o.status} ${decided === 'approved' ? o.good : o.accent}`} role="status">
                    <Check size={13} strokeWidth={2.5} aria-hidden="true" />{decided === 'approved' ? 'Approved. Rights Agent files it next.' : decided === 'rejected' ? 'Rejected' : <>Waiting in <Link href="/approvals" className={o.linkInline}>Approvals</Link></>}
                  </p>
                ) : (
                  <Button variant="primary" onClick={() => propose({
                    id: pid, type: 'filing', title: `${u.source} claim for Night Bus`, agent: 'Rights Agent', due: 'Nov 20',
                    impact: `Claims ${(u.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`, risk: 'low',
                    context: 'Unclaimed money', href: '/rights/unclaimed', artists: ['The Low Hours'], releases: ['Night Bus EP'], dept: 'Rights',
                  })}>Prepare claim</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className={o.small}>Rights Agent searches SoundExchange and the MLC every week. Amounts are what each society reports; the final payment can differ slightly.</p>
    </>
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
