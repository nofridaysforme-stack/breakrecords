'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { Filter } from '@/components/money/Filter';
import type { ActivityEvent, ActivityKind } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Activity.module.css';

const KIND: Record<ActivityKind, { cls: string; icon?: boolean }> = {
  'Agent run': { cls: s.kGood }, Flag: { cls: s.kCritical, icon: true }, Error: { cls: s.kCritical, icon: true },
  Approval: { cls: s.kAccent }, 'Tool call': { cls: s.kMuted }, Edit: { cls: s.kMuted },
};

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** 5g. Every row opens to its inputs, reasoning and output. The flagged run starts open, as drawn. */
export function ActivityView({ events, initialOpen = 'RUN-88119' }: { events: ActivityEvent[]; initialOpen?: string }) {
  const [type, setType] = useState('All');
  const [dept, setDept] = useState('All');
  const [open, setOpen] = useState<Set<string>>(new Set([initialOpen]));
  const types = ['All', ...Array.from(new Set(events.map((e) => e.kind)))];
  const depts = ['All', ...Array.from(new Set(events.map((e) => e.dept))).sort()];
  const shown = useMemo(() => events.filter((e) => (type === 'All' || e.kind === type) && (dept === 'All' || e.dept === dept)), [events, type, dept]);

  const exportCsv = () => {
    const head = ['When', 'Kind', 'What', 'Who', 'Department', 'ID', 'Inputs', 'Reasoning', 'Output'];
    const rows = shown.map((e) => [e.when, e.kind, e.text, e.who, e.dept, e.id, e.inputs.join('; '), e.reasoning, e.output]);
    const blob = new Blob([[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'activity-log.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const toggle = (id: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className={o.head}>
        <div><PageTitle>Activity log</PageTitle><p className={o.sub}>Everything agents and people did, with inputs and outputs.</p></div>
        <div className={o.actions}>
          <Filter label="Type" value={type} options={types} onChange={setType} />
          <Filter label="Dept" value={dept} options={depts} onChange={setDept} />
          <Button onClick={exportCsv}>Export</Button>
        </div>
      </div>
      <p className="visually-hidden" role="status">{shown.length} entries shown</p>
      {shown.length === 0 ? <p className={o.small}>Nothing matches these filters.</p> : (
        <ul className={s.log}>
          {shown.map((e) => {
            const isOpen = open.has(e.id); const k = KIND[e.kind];
            return (
              <li key={e.id} className={`${s.entry} ${isOpen ? s.open : ''}`}>
                <button type="button" className={s.row} aria-expanded={isOpen} aria-controls={`d-${e.id}`} onClick={() => toggle(e.id)}>
                  <span className={s.when}>{e.when}</span>
                  <span className={`${s.kind} ${k.cls}`}>{k.icon && <CircleAlert size={11} strokeWidth={2.5} aria-hidden="true" />}{e.kind}</span>
                  <span className={s.text}>{e.text}</span>
                  <span className={s.who}>{e.who}</span>
                  <span className={s.id}>{e.id}<ChevronDown size={14} className={s.chev} aria-hidden="true" /></span>
                </button>
                <div id={`d-${e.id}`} className={s.detail} hidden={!isOpen}>
                  <section className={s.box} aria-label="Inputs"><h3 className={s.boxHead}>Inputs</h3><p className={s.inputs}>{e.inputs.map((i) => <span key={i}>{i}<br /></span>)}</p></section>
                  <section className={s.box} aria-label="Reasoning"><h3 className={s.boxHead}>Reasoning</h3><p className={s.boxText}>{e.reasoning}</p></section>
                  <section className={s.box} aria-label="Output"><h3 className={s.boxHead}>Output</h3><p className={s.boxText}>{e.output}</p></section>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
