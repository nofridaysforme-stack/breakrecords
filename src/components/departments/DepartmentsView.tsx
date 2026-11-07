'use client';

import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { AutonomyDial, type Autonomy } from '@/components/ui/AutonomyDial';
import { formatMoney } from '@/lib/money';
import type { getDepartments } from '@/data/api';
import type { Department } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Departments.module.css';

type Data = ReturnType<typeof getDepartments>;

const LEVEL: Record<Autonomy, string> = { observe: 'Observe', suggest: 'Suggest', draft_and_wait: 'Draft and wait', act_within_limits: 'Act within limits' };
const DOT: Record<Department['state'], string> = { working: s.dWorking, waitingOnYou: s.dCritical, blocked: s.dCritical, done: s.dDone, idle: s.dIdle, later: s.dIdle };

/** 5f. One department open for editing, then all 14. Phase 2 departments show but can't be opened. */
export function DepartmentsView({ data, initialId = 'royalties' }: { data: Data; initialId?: string }) {
  const [depts, setDepts] = useState(data.departments);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState(depts.some((d) => d.id === initialId && d.phase === 1) ? initialId : 'royalties');
  const [saved, setSaved] = useState<string | null>(null);
  const d = depts.find((x) => x.id === editId)!;
  const active = depts.filter((x) => x.phase === 1).length;
  const later = depts.length - active;
  const hand = useRef<HTMLDialogElement>(null);
  const [pick, setPick] = useState(data.team[0].id);
  const person = people[d.id];

  const setLevel = (v: Autonomy) => {
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, autonomy: v } : x)));
    setSaved(`${d.name} is now set to ${LEVEL[v]}.`);
  };

  return (
    <>
      <div><PageTitle>Departments</PageTitle><p className={o.sub}>{active} active · {later} coming in Phase 2. Money, signatures, filings and public posts always need your approval.</p></div>

      <section className={s.editor} aria-labelledby="edit-h">
        <div className={s.editMeta}>
          <p className={o.eyebrow}>Editing</p>
          <h2 id="edit-h" className={s.editName}>{d.name}</h2>
          <p className={s.editAgent}>{d.agent} · {d.tasks} tasks this week</p>
          <dl className={s.editFacts}>
            <dt>Spend cap</dt><dd className={o.mono}>{d.spendCap !== null ? `${formatMoney(d.spendCap, { wholeIfRound: true })} / month` : 'None'}</dd>
            <dt>Person</dt>
            <dd>{person ? <>{data.team.find((t) => t.id === person)?.name}</> : 'Not assigned'} · <button type="button" className={o.linkInline} onClick={() => hand.current?.showModal()}>{person ? 'Change person' : 'Hand to a person'}</button></dd>
          </dl>
        </div>
        <div className={s.dial}>
          <AutonomyDial
            value={d.autonomy ?? 'draft_and_wait'}
            onChange={setLevel}
            disabled={d.canAct ? {} : { act_within_limits: d.actNote }}
            note={d.canAct ? `"Act within limits" is available for ${d.name}: ${d.actNote}` : undefined}
          />
          {saved && <p className={s.saved} role="status"><Check size={14} className={o.good} aria-hidden="true" />{saved}</p>}
        </div>
      </section>

      <ul className={s.grid} aria-label="All departments">
        {depts.map((x) => {
          const locked = x.phase === 2;
          const body = (
            <>
              <span className={s.cardTop}><span className={s.cardName}>{x.name}</span>{locked && <span className={s.tag}>Phase 2</span>}</span>
              <span className={s.agent}><span className={`${s.dot} ${DOT[x.state]}`} aria-hidden="true" />{x.agent} · {x.stateLabel}</span>
              <span className={s.cardFoot}><span>{x.autonomy ? LEVEL[x.autonomy] : 'Phase 2'}</span>{x.tasks !== null && <span className={o.mono}>{x.tasks} this week</span>}</span>
            </>
          );
          return (
            <li key={x.id}>
              {locked ? <div className={`${s.card} ${s.locked}`}>{body}</div> : (
                <button type="button" className={`${s.card} ${x.id === editId ? s.sel : ''}`} aria-pressed={x.id === editId} onClick={() => { setEditId(x.id); setSaved(null); document.getElementById('edit-h')?.scrollIntoView({ block: 'nearest' }); }}>{body}</button>
              )}
            </li>
          );
        })}
      </ul>

      <dialog ref={hand} className={o.drawer} aria-labelledby="hand-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={o.drawerHead}><h2 id="hand-h" className={o.drawerTitle}>Hand {d.name} to a person</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => hand.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); setPeople((p) => ({ ...p, [d.id]: pick })); setSaved(`${data.team.find((t) => t.id === pick)?.name} now owns ${d.name}.`); hand.current?.close(); }}>
          <fieldset className={s.people}>
            <legend className={o.small}>They get {d.agent}&apos;s work and its approvals. The agent keeps preparing work for them.</legend>
            {data.team.map((t) => (
              <label key={t.id} className={s.person}><input type="radio" name="person" value={t.id} checked={pick === t.id} onChange={() => setPick(t.id)} /><span><strong>{t.name}</strong> <span className={o.muted}>{t.role}</span></span></label>
            ))}
          </fieldset>
          <div className={o.formActions}><Button variant="primary" type="submit">Hand over</Button><Button onClick={() => hand.current?.close()}>Cancel</Button></div>
        </form>
      </dialog>
    </>
  );
}
