'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert, Plus } from 'lucide-react';
import type { SyncResponse } from '@breakrecords/contract';
import { MEDIA, type SyncMedia } from '@breakrecords/core/sync';
import { formatPercent } from '@breakrecords/core/percent';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { RiskFlag } from '@/components/ui/Status';
import { useDecisions } from '@/data/decisions';
import o from '@/components/ops/Ops.module.css';

type Data = SyncResponse;
type Quote = Data['briefs'][number]['quotes'][number];
const STATE: Record<Quote['state'], { risk: 'low' | 'dueSoon' | 'needsEyes' | 'blocked'; label: string }> = {
  draft: { risk: 'dueSoon', label: 'Draft' }, sent: { risk: 'needsEyes', label: 'Sent, waiting on the client' },
  awaiting_signature: { risk: 'needsEyes', label: 'Accepted: sign in Approvals' }, licensed: { risk: 'low', label: 'Licensed, waiting on the fee' },
  paid: { risk: 'low', label: 'Paid' }, declined: { risk: 'blocked', label: 'Declined' },
};
const dollars = (s: string) => Math.round(Number(s || '0') * 100);

/**
 * Sync licensing: briefs from music supervisors and brands, quotes for your recordings (one fee
 * for master and song), the license as a signature in Approvals, and the fee recorded as income.
 */
export function SyncView({ data: initial }: { data: Data }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(initial.briefs.length === 0);
  const [b, setB] = useState({ title: '', client: '', media: 'film' as SyncMedia, territory: 'Worldwide', term: 'In perpetuity', budget: '', due: '' });
  const [quoting, setQuoting] = useState<string | null>(null);
  const [q, setQ] = useState({ recordingId: initial.recordings[0]?.id ?? '', fee: '', master: '50', use: '' });
  const { decisions, refresh } = useDecisions();

  async function post(url: string, body: object, ok: string) {
    setError(null); setNote(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That didn’t go through.'); return false; }
      setD(out); setNote(ok); void refresh();
      return true;
    } catch { setError('Couldn’t reach the server. Nothing changed.'); return false; }
  }
  // A license card decided in Approvals moves the quote on without a reload.
  const stateOf = (x: Quote): Quote['state'] => (x.state === 'awaiting_signature' && x.approvalId && decisions[x.approvalId]?.status === 'approved' ? 'licensed' : x.state);
  const rec = d.recordings.find((r) => r.id === q.recordingId);

  return (
    <>
      <div className={o.head}>
        <div><PageTitle>Sync licensing</PageTitle><p className={o.sub}>Briefs from music supervisors and brands. Each license is a signature, so it comes to you in Approvals.</p></div>
        {!briefing && <Button variant="primary" onClick={() => setBriefing(true)}><Plus size={14} aria-hidden="true" />New brief</Button>}
      </div>

      {briefing && (
        <section className={o.card} aria-labelledby="new-brief">
          <h2 id="new-brief" className={o.cardTitle}>New brief</h2>
          <form className={o.form} style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void post('/api/sync/briefs', {
            title: b.title.trim(), client: b.client.trim(), media: b.media, territory: b.territory.trim() || undefined, term: b.term.trim() || undefined,
            ...(b.budget ? { budget: dollars(b.budget) } : {}), ...(b.due ? { due: b.due } : {}),
          }, `Brief “${b.title.trim()}” added.`).then((ok) => { if (ok) { setBriefing(false); setB({ ...b, title: '', client: '', budget: '', due: '' }); } }); }}>
            <label className={o.field}>What it’s for<input className={o.input} value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} maxLength={200} placeholder="Closing credits, indie feature" /></label>
            <label className={o.field}>Client<input className={o.input} value={b.client} onChange={(e) => setB({ ...b, client: e.target.value })} maxLength={200} placeholder="Music supervisor or company" /></label>
            <div className={o.field}><label htmlFor="b-media">Media</label>
              <select id="b-media" className={o.input} value={b.media} onChange={(e) => setB({ ...b, media: e.target.value as SyncMedia })}>
                {Object.entries(MEDIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <label className={o.field}>Territory<input className={o.input} value={b.territory} onChange={(e) => setB({ ...b, territory: e.target.value })} maxLength={120} /></label>
            <label className={o.field}>Term<input className={o.input} value={b.term} onChange={(e) => setB({ ...b, term: e.target.value })} maxLength={120} /></label>
            <label className={o.field}>Budget, if they gave one ($)<input className={o.input} inputMode="decimal" value={b.budget} onChange={(e) => setB({ ...b, budget: e.target.value.replace(/[^\d.]/g, '') })} maxLength={12} /></label>
            <label className={o.field}>Reply by (optional)<input className={o.input} type="date" value={b.due} onChange={(e) => setB({ ...b, due: e.target.value })} /></label>
            <div className={o.formActions}>
              <Button type="submit" variant="primary" disabled={!b.title.trim() || !b.client.trim()} disabledReason="Say what it’s for and who it’s from.">Add brief</Button>
              {d.briefs.length > 0 && <Button onClick={() => setBriefing(false)}>Cancel</Button>}
            </div>
          </form>
        </section>
      )}

      {note && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{note}</p>}
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not done. {error}</p>}

      {d.briefs.map((br) => (
        <section key={br.id} id={br.id} className={o.card} aria-labelledby={`brief-${br.id}`}>
          <div className={o.drawerHead}>
            <h2 id={`brief-${br.id}`} className={o.cardTitle}>{br.title}</h2>
            <span className={o.small}>{br.client}</span>
          </div>
          <p className={o.muted}>{MEDIA[br.media]} · {br.territory} · {br.term}{br.budget != null ? <> · budget <Money cents={br.budget} /></> : ''}{br.due ? ` · reply by ${br.due}` : ''}</p>
          {br.quotes.length > 0 && (
            <div className={o.tableWrap} role="region" aria-label={`Quotes for ${br.title}`} tabIndex={0}>
              <table className={o.table}>
                <thead><tr><th scope="col">Recording</th><th scope="col">Fee</th><th scope="col">Master / song</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{br.quotes.map((x) => {
                  const st = STATE[stateOf(x)];
                  const act = (action: string, ok: string) => void post(`/api/sync/quotes/${encodeURIComponent(x.id)}`, { action }, ok);
                  return (
                    <tr key={x.id}>
                      <th scope="row">{x.recording}<span className={o.small} style={{ display: 'block' }}>{x.use}</span></th>
                      <td className={o.cellMono}><Money cents={x.fee} /></td>
                      <td className={o.cellMono}><Money cents={x.master} /> / <Money cents={x.song} /></td>
                      <td><RiskFlag risk={st.risk} label={st.label} /></td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          {stateOf(x) === 'draft' && <Button size="sm" onClick={() => act('send', 'Marked sent. Send the quote to the client yourself.')}>Mark sent</Button>}
                          {stateOf(x) === 'sent' && <><Button size="sm" variant="primary" onClick={() => act('accept', 'Accepted. Sign the license in Approvals.')}>Client accepted</Button><Button size="sm" onClick={() => act('decline', 'Marked declined.')}>Declined</Button></>}
                          {stateOf(x) === 'awaiting_signature' && <Link href="/approvals" className={o.linkInline}>Sign in Approvals</Link>}
                          {['awaiting_signature', 'licensed', 'paid'].includes(stateOf(x)) && <Link href={`/sync/license/${encodeURIComponent(x.id)}`} className={o.linkInline}>License</Link>}
                          {stateOf(x) === 'licensed' && <Button size="sm" variant="primary" onClick={() => act('paid', 'Fee recorded as sync income on the master and the song.')}>Fee received</Button>}
                          {stateOf(x) === 'paid' && <span className={o.small}>{x.paidRef}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          {quoting === br.id ? (
            <form className={o.form} style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void post(`/api/sync/briefs/${encodeURIComponent(br.id)}/quotes`, {
              recordingId: q.recordingId, fee: dollars(q.fee), masterBp: Math.round(Number(q.master || '50') * 100), use: q.use.trim(),
            }, 'Quote added as a draft.').then((ok) => { if (ok) { setQuoting(null); setQ({ ...q, fee: '', use: '' }); } }); }}>
              <div className={o.field}><label htmlFor={`q-rec-${br.id}`}>Recording</label>
                <select id={`q-rec-${br.id}`} className={o.input} value={q.recordingId} onChange={(e) => setQ({ ...q, recordingId: e.target.value })}>
                  {d.recordings.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.artist}{r.oneStop ? ' · one-stop' : ''}</option>)}
                </select>
                {rec && <span className={o.hint}>{rec.oneStopNote} <Link href={`/sync/one-sheet/${encodeURIComponent(rec.id)}`} className={o.linkInline}>One-sheet</Link></span>}
              </div>
              <label className={o.field}>Fee ($)<input className={o.input} inputMode="decimal" value={q.fee} onChange={(e) => setQ({ ...q, fee: e.target.value.replace(/[^\d.]/g, '') })} maxLength={12} /></label>
              <label className={o.field}>Master’s share of the fee (%)<input className={o.input} inputMode="decimal" value={q.master} onChange={(e) => setQ({ ...q, master: e.target.value.replace(/[^\d.]/g, '') })} maxLength={6} />
                <span className={o.hint}>The song gets {formatPercent(10000 - Math.round(Number(q.master || '0') * 100))}. Usually half each.</span></label>
              <label className={o.field}>The use<input className={o.input} value={q.use} onChange={(e) => setQ({ ...q, use: e.target.value })} maxLength={500} placeholder="Closing credits, 45 seconds" /></label>
              <div className={o.formActions}>
                <Button type="submit" variant="primary" disabled={!q.recordingId || dollars(q.fee) <= 0 || !q.use.trim() || Number(q.master) > 100} disabledReason="Pick a recording, a fee above $0 and the use.">Add quote</Button>
                <Button onClick={() => setQuoting(null)}>Cancel</Button>
              </div>
            </form>
          ) : <div><Button size="sm" onClick={() => setQuoting(br.id)}><Plus size={14} aria-hidden="true" />Offer a recording</Button></div>}
        </section>
      ))}
      {d.briefs.length === 0 && !briefing && <p className={o.muted}>No briefs yet.</p>}
    </>
  );
}
