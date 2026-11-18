'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { z } from 'zod';
import type { AgentsResponse } from '@breakrecords/contract';
import { Button } from '@/components/ui/Button';
import o from '@/components/ops/Ops.module.css';
import s from './Departments.module.css';

type Agents = z.infer<typeof AgentsResponse>;
/** Departments whose agent runs today; the rest start in later parts of the build. */
const RUNNING = ['metadata', 'rights', 'royalties', 'audit'];

/** What the agents found that's still open, for the department being edited, and Run now. */
export function AgentFindings({ data, dept, deptName, onRun }: { data: Agents; dept: string; deptName: string; onRun?: (a: Agents) => void }) {
  const [view, setView] = useState(data);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const mine = view.findings.filter((f) => f.dept === dept);
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/agents/run', { method: 'POST' });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ ok: false, text: out?.message ?? 'The agents didn’t run. Nothing changed.' }); return; }
      setView(out); onRun?.(out);
      const r = out.result as { found: number; closed: number; proposed: number; fixed: number; errors: string[] };
      const parts = [r.found ? `${r.found} new` : null, r.proposed ? `${r.proposed} ${r.proposed === 1 ? 'card' : 'cards'} in Approvals` : null, r.fixed ? `${r.fixed} fixed` : null, r.closed ? `${r.closed} resolved` : null].filter(Boolean);
      setMsg({ ok: !r.errors.length, text: `${parts.length ? `Done: ${parts.join(', ')}.` : 'Done. Nothing new.'}${r.errors.length ? ` ${r.errors.length} couldn’t be prepared: ${r.errors[0]}` : ''}` });
    } catch { setMsg({ ok: false, text: 'Couldn’t reach the server. Nothing changed.' }); } finally { setBusy(false); }
  };
  const dismiss = async (key: string) => {
    setMsg(null);
    const res = await fetch(`/api/agents/findings/${encodeURIComponent(key)}/dismiss`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: note.trim() }) }).catch(() => null);
    const out = await res?.json().catch(() => null);
    if (!res?.ok) { setMsg({ ok: false, text: out?.message ?? 'That didn’t save.' }); return; }
    setView(out); onRun?.(out); setDismissing(null); setNote('');
    setMsg({ ok: true, text: 'Dismissed. The agents won’t raise it again.' });
  };
  return (
    <section className={s.findings} aria-labelledby="found-h">
      <div className={s.findHead}>
        <div>
          <h2 id="found-h" className={s.findTitle}>What {deptName} found</h2>
          <p className={o.small}>{!view.live ? 'Agents run on your live workspace. Sample data shows what they reported before, in Activity.'
            : view.lastRun ? `Last run ${view.lastRun.at}${view.lastRun.trigger === 'schedule' ? ', on the daily schedule' : ', started by hand'}. They run every day.`
            : 'The agents haven’t run yet. They run every day, or now.'}</p>
        </div>
        {view.live && <Button onClick={() => void run()} disabled={busy}>{busy ? 'Running' : 'Run the agents now'}</Button>}
      </div>
      {msg && <p className={o.toast} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{msg.text}</p>}
      {view.live && (mine.length ? (
        <ul className={s.findList}>
          {mine.map((f) => (
            <li key={f.key} className={s.finding}>
              <div className={s.findBody}>
                <p className={s.findLine}>{f.title}</p>
                <p className={o.small}>{f.detail} <span className={o.mono}>{f.rule}</span> · since {f.since}</p>
                {dismissing === f.key && (
                  <form className={s.dismissForm} aria-label={`Dismiss: ${f.title}`} onSubmit={(e) => { e.preventDefault(); void dismiss(f.key); }}>
                    <label className={o.field}>Why it isn’t worth doing<input className={o.input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} autoFocus /></label>
                    <span className={s.findActs}><Button type="submit" size="sm" disabled={!note.trim()}>Dismiss</Button><Button size="sm" onClick={() => setDismissing(null)}>Cancel</Button></span>
                  </form>
                )}
              </div>
              <span className={s.findActs}>
                {f.approvalId ? <Link href={`/approvals/${f.approvalId}`} className={o.linkInline}>Open the card<span className="visually-hidden"> about {f.title}</span></Link>
                  : f.href && <Link href={f.href} className={o.linkInline}>Fix it<span className="visually-hidden"> about {f.title}</span></Link>}
                {dismissing !== f.key && <Button size="sm" variant="ghost" onClick={() => { setDismissing(f.key); setNote(''); }}>Dismiss<span className="visually-hidden"> about {f.title}</span></Button>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className={o.small}>{RUNNING.includes(dept) ? 'Nothing open. ' : ''}{RUNNING.includes(dept) ? 'When something needs doing, it shows here with a link to fix it.' : `${deptName}’s agent starts running in a later part of this build.`}</p>)}
    </section>
  );
}
