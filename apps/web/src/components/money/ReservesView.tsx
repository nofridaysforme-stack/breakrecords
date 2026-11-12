'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import type { ReservesResponse } from '@breakrecords/contract';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { RiskFlag } from '@/components/ui/Status';
import { useDecisions } from '@/data/decisions';
import s from './Money.module.css';

const STATUS = {
  held: { risk: 'blocked', label: 'Held' },
  releasing: { risk: 'dueSoon', label: 'Release waiting on approval' },
  released: { risk: 'low', label: 'Released' },
  forfeited: { risk: 'low', label: 'Forfeited' },
} as const;

/**
 * Reserves (P1 #4): an audit flag holds a recording's income from unpaid batches. Resolving it
 * as real listeners asks for approval to release the money; artificial streams forfeit it.
 */
export function ReservesView({ data: initial }: { data: ReservesResponse }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flag, setFlag] = useState({ recordingId: '', note: '' });
  const [resolving, setResolving] = useState<{ id: string; outcome: 'release' | 'forfeit' } | null>(null);
  const [why, setWhy] = useState('');
  const { decisions, refresh } = useDecisions();

  async function send(path: string, body: object, done: () => void) {
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) { setError(out.message ?? 'That didn’t go through.'); return; }
      setData(out); done(); void refresh();
    } catch { setError('Couldn’t reach the server. Nothing changed.'); }
  }
  // The release card is decided in Approvals; follow that decision here without a reload.
  const statusOf = (r: ReservesResponse['items'][number]) =>
    r.status === 'releasing' && r.approvalId && decisions[r.approvalId]?.status === 'approved' ? 'released' : r.status;

  return (
    <section className={s.card} aria-labelledby="reserves-title" id="reserves">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="reserves-title" className={s.cardTitle}>Reserves</h2>
        {!flagging && <Button size="sm" onClick={() => setFlagging(true)}>Flag a recording</Button>}
      </div>
      <p className={s.text}>While a recording is flagged, its income stays out of payouts. Releasing it needs your approval; artificial streams are never paid.</p>

      {flagging && (
        <form className={s.reserveForm} onSubmit={(e) => { e.preventDefault(); void send('/api/money/reserves', flag, () => { setFlagging(false); setFlag({ recordingId: '', note: '' }); }); }}>
          <label className={s.small} style={{ fontWeight: 600 }}>Recording
            <select className={s.policySelect} value={flag.recordingId} onChange={(e) => setFlag({ ...flag, recordingId: e.target.value })}>
              <option value="">Choose a recording</option>
              {data.recordings.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </label>
          <label className={s.small} style={{ fontWeight: 600 }}>Why it’s flagged
            <input className={s.policySelect} value={flag.note} onChange={(e) => setFlag({ ...flag, note: e.target.value })} maxLength={200} placeholder="unusual stream spike on Nov 9" />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="primary" size="sm" disabled={!flag.recordingId || !flag.note.trim()} disabledReason="Choose a recording and say why.">Flag and hold income</Button>
            <Button size="sm" onClick={() => setFlagging(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {data.items.length === 0 ? <p className={s.small}>No recording has been flagged.</p> : (
        <ul>
          {data.items.map((r) => {
            const st = STATUS[statusOf(r)];
            const open = resolving?.id === r.id;
            return (
              <li key={r.id} className={s.reserveRow}>
                <div className={s.reserveTop}>
                  <span><strong>{r.recording}</strong> <span className={s.rowMeta}>· {r.note} · flagged {r.opened}</span></span>
                  <RiskFlag risk={st.risk} label={st.label} />
                </div>
                <p className={s.small}>
                  {statusOf(r) === 'held' || statusOf(r) === 'releasing'
                    ? <><Money cents={r.heldNow} /> held from unpaid batches.</>
                    : statusOf(r) === 'released' ? <>Released: paid with the next batch.</> : <>Never paid out.</>}
                  {r.outcomeNote ? ` ${r.outcomeNote}.` : ''}
                  {statusOf(r) === 'releasing' && r.approvalId && <> <Link href="/approvals" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Review the release in Approvals</Link>.</>}
                </p>
                {r.status === 'held' && !open && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Button size="sm" onClick={() => { setResolving({ id: r.id, outcome: 'release' }); setWhy(''); }}>Real listeners: release<span className="visually-hidden"> {r.recording}</span></Button>
                    <Button size="sm" variant="destructive" onClick={() => { setResolving({ id: r.id, outcome: 'forfeit' }); setWhy(''); }}>Artificial streams: forfeit<span className="visually-hidden"> {r.recording}</span></Button>
                  </div>
                )}
                {open && (
                  <form className={s.reserveForm} onSubmit={(e) => { e.preventDefault(); void send(`/api/money/reserves/${r.id}/resolve`, { outcome: resolving.outcome, note: why }, () => setResolving(null)); }}>
                    <label className={s.small} style={{ fontWeight: 600 }}>{resolving.outcome === 'release' ? 'What showed the streams are real?' : 'What showed the streams are artificial?'}
                      <input className={s.policySelect} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} autoFocus />
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button type="submit" size="sm" variant={resolving.outcome === 'release' ? 'primary' : 'destructive'} disabled={!why.trim()} disabledReason="Say why.">
                        {resolving.outcome === 'release' ? 'Ask to release' : 'Forfeit the income'}
                      </Button>
                      <Button size="sm" onClick={() => setResolving(null)}>Cancel</Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className={s.text} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={16} aria-hidden="true" />Not done. {error}</p>}
    </section>
  );
}
