'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useDecisions } from '@/data/decisions';
import { contextFor } from '@/data/labelHead';
import { search } from '@/data/search';
import s from './LabelHeadPanel.module.css';

const STOP = new Set('a about an and are can did do does for from how i in is it me my of on or should the this to was what when where which who why will with you your'.split(' '));
/** The words worth searching for in a question. */
const keywords = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

type Turn = { q: string; a: string; basis?: string; links?: { label: string; href: string }[] };

/** 380px right drawer on any screen (flows.md). Answers from what's on screen; never acts. */
export function LabelHeadPanel({ open, question, approvalIds, onClose }: { open: boolean; question?: string; approvalIds: string[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname() ?? '/';
  const ctx = contextFor(path);
  const needs = useDecisions().openCount(approvalIds);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) { setLastPath(path); setTurns([]); }

  const ask = (q: string) => {
    const t = q.trim(); if (!t) return;
    const known = ctx.qa.find((x) => x.q.toLowerCase() === t.toLowerCase());
    if (known) { setTurns((ts) => [...ts, { q: known.q, a: known.a, basis: known.basis }]); return; }
    const hits = search(keywords(t), 3);
    setTurns((ts) => [...ts, hits.length
      ? { q: t, a: 'I can only answer from what’s in Indie SRVCS, and I don’t have a direct answer to that. These look related:', links: hits.map((h) => ({ label: `${h.label} · ${h.group}`, href: h.href })) }
      : { q: t, a: 'I don’t know yet, and I won’t guess. I’ve noted the question; nothing was changed.' }]);
  };

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { d.showModal(); if (question) ask(question); }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <dialog ref={ref} className={s.drawer} aria-labelledby="lh-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className={s.head}>
        <h2 id="lh-title" className={s.title}><span className={s.square} aria-hidden="true" />Label Head</h2>
        <button type="button" className={s.close} aria-label="Close Label Head" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <Link href="/approvals" className={s.needs} onClick={onClose}>
        <span>Needs you</span><span className={s.count}>{needs}</span>
      </Link>
      <section className={s.context} aria-labelledby="lh-ctx">
        <h3 id="lh-ctx" className={s.eyebrow}>On this screen · {ctx.title}</h3>
        <p className={s.summary}>{ctx.summary}</p>
      </section>
      <div className={s.convo} aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={s.turn}>
            <p className={s.bubble}>{t.q}</p>
            <div className={s.answer}>
              <p>{t.a}</p>
              {t.links && <ul className={s.links}>{t.links.map((l) => <li key={l.href + l.label}><Link href={l.href} onClick={onClose} className={s.link}>{l.label}</Link></li>)}</ul>}
              {t.basis && <p className={s.basis}>Based on: {t.basis}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className={s.chips}>
        {ctx.qa.filter((x) => !turns.some((t) => t.q === x.q)).map((x) => <button key={x.q} type="button" className={s.chip} onClick={() => ask(x.q)}>{x.q}</button>)}
      </div>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); ask(text); setText(''); }}>
        <label htmlFor="lh-ask" className="visually-hidden">Ask the Label Head</label>
        <input id="lh-ask" className={s.input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this screen" autoComplete="off" />
      </form>
      <p className={s.note}>I answer and point you to things. I don&apos;t approve, pay, sign or file from here.</p>
    </dialog>
  );
}
