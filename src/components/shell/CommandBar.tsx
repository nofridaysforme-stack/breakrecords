'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ListChecks, MessageSquare, Search } from 'lucide-react';
import { search, type SearchItem } from '@/data/search';
import { looksLikeGoal } from '@/lib/plan';
import s from './CommandBar.module.css';

type Option = { id: string; kind: 'goal' | 'ask' | 'item'; label: string; hint: string; group: string; href?: string };

const SUGGESTED: Option[] = [
  { id: 'sg-approvals', kind: 'item', label: 'Approvals', hint: 'What needs you', group: 'Go to', href: '/approvals' },
  { id: 'sg-payout', kind: 'item', label: 'October payout batch', hint: '$1,240.18 to 6 payees', group: 'Money', href: '/money/payouts' },
  { id: 'sg-glasshouse', kind: 'item', label: 'Glasshouse', hint: 'Release runbook', group: 'Catalog', href: '/releases/rel_glasshouse' },
  { id: 'sg-goal', kind: 'goal', label: 'Plan an EP for May', hint: 'Example goal', group: 'Start a plan' },
];

/**
 * ⌘K anywhere in the app. Searches catalog, people and money; a plain-language goal starts a
 * plan (flows.md). A native modal dialog, so focus is trapped and Esc closes it.
 */
export function CommandBar({ open, initialQuery, onClose, onAsk }: { open: boolean; initialQuery: string; onClose: () => void; onAsk: (q: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { setQ(initialQuery); setActive(0); d.showModal(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open, initialQuery]);

  const options: Option[] = useMemo(() => {
    const t = q.trim();
    if (!t) return SUGGESTED;
    const hits: Option[] = search(t).map((i: SearchItem) => ({ id: i.id, kind: 'item', label: i.label, hint: i.hint, group: i.group, href: i.href }));
    const goal: Option = { id: 'goal', kind: 'goal', label: `Plan this: “${t}”`, hint: 'The Label Head drafts a plan for you to approve', group: 'Start a plan' };
    const ask: Option = { id: 'ask', kind: 'ask', label: `Ask the Label Head: “${t}”`, hint: 'Answers from what’s in Break Records', group: 'Ask' };
    return looksLikeGoal(t) ? [goal, ...hits, ask] : [...hits, goal, ask];
  }, [q]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    const text = o.id === 'sg-goal' ? o.label : q.trim();
    if (o.kind === 'goal') { onClose(); router.push(`/plan?goal=${encodeURIComponent(text)}`); return; }
    if (o.kind === 'ask') { onAsk(text); return; }
    onClose(); if (o.href) router.push(o.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === 'Home' && e.ctrlKey) { setActive(0); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
  };

  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, listId]);

  let lastGroup = '';
  const count = options.filter((o) => o.kind === 'item').length;
  return (
    <dialog ref={ref} className={s.dialog} aria-label="Search or tell me a goal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className={s.field}>
        <Search size={18} aria-hidden="true" className={s.icon} />
        <input
          ref={input} className={s.input} value={q} placeholder="Search or tell me a goal" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-label="Search or tell me a goal"
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
        />
        <kbd className={s.kbd}>Esc</kbd>
      </div>
      <ul id={listId} role="listbox" className={s.list} aria-label="Results">
        {options.map((o, i) => {
          const head = o.group !== lastGroup ? o.group : null; lastGroup = o.group;
          return (
            <li key={o.id} role="presentation">
              {head && <div className={s.group} role="presentation">{head}</div>}
              <div
                id={`${listId}-${i}`} role="option" aria-selected={i === active} className={s.option}
                onMouseMove={() => setActive(i)} onClick={() => choose(o)}
              >
                <span className={s.optIcon} aria-hidden="true">{o.kind === 'goal' ? <ListChecks size={14} /> : o.kind === 'ask' ? <MessageSquare size={14} /> : <ArrowRight size={14} />}</span>
                <span className={s.optText}><span className={s.optLabel}>{o.label}</span><span className={s.optHint}>{o.hint}</span></span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={s.foot}>
        <span className="visually-hidden" role="status">{q.trim() ? `${count} ${count === 1 ? 'match' : 'matches'}` : ''}</span>
        <span><kbd className={s.kbd}>↑</kbd> <kbd className={s.kbd}>↓</kbd> to move · <kbd className={s.kbd}>Enter</kbd> to open</span>
        <span>Plans and answers never act on their own.</span>
      </p>
    </dialog>
  );
}
