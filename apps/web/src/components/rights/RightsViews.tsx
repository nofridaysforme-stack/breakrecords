'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
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

/** 5c. Recordings by registration, each cell a shape and a word, plus the two callouts. */
export function RegistrationsView({ data, unclaimed }: { data: Awaited<ReturnType<typeof getRegistrations>>; unclaimed: number }) {
  const needs = data.rows.filter((r) => r.cells[1].status === 'needsYou').length;
  return (
    <>
      <div className={`${o.head} ${s.head}`}>
        <div><PageTitle>Registrations</PageTitle><p className={o.sub}>Every place a recording or song needs to be registered so it gets paid.</p></div>
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
            {data.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><span className={s.recName}>{r.name}</span><span className={s.recArtist}>{r.artist}</span></th>
                {r.cells.map((cell, i) => (
                  <td key={data.columns[i].key}>
                    <StatusPill status={cell.status} />
                    {cell.ref && <span className={s.ref}>{cell.ref}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={o.callouts}>
        <section className={`${o.callout} ${o.calloutCritical}`} aria-labelledby="mlc-h">
          <div className={o.calloutBody}>
            <h2 id="mlc-h" className={o.calloutTitle}><CircleAlert size={15} strokeWidth={2.5} className={o.critical} aria-hidden="true" />{needs} <Term term="MLC" /> filings need you</h2>
            <p className={o.calloutText}>Publishing Agent prepared them. Confirm the writers and shares, then I&apos;ll submit.</p>
          </div>
          <ButtonLink href="/approvals/apr_mlc" variant="primary" className={s.nowrap}>Open filing</ButtonLink>
        </section>
        <section className={o.callout} aria-labelledby="unc-h">
          <div className={o.calloutBody}>
            <h2 id="unc-h" className={o.calloutTitle}><Money cents={unclaimed} /> unclaimed found</h2>
            <p className={o.calloutText}>SoundExchange and the MLC are holding royalties for &quot;Night Bus&quot;. Claim with one filing each.</p>
          </div>
          <ButtonLink href="/rights/unclaimed" className={s.nowrap}>Start claim</ButtonLink>
        </section>
      </div>
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
