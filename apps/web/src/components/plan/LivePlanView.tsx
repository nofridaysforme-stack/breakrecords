'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert } from 'lucide-react';
import type { z } from 'zod';
import type { PlanDraftResponse, PlansResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { GoalBox } from '@/components/ui/Blocks';
import o from '@/components/ops/Ops.module.css';
import s from './Plan.module.css';

type Draft = z.infer<typeof PlanDraftResponse>;
type Plans = z.infer<typeof PlansResponse>['plans'];

const EXAMPLES = ['Get everything registered', "Find money I'm owed", 'Get everyone paid', 'Get the next release ready'];

/** Label Head, rules first: a goal becomes a plan from what the agents found open; approving saves it. */
export function LivePlanView({ goal, draft, plans: initial }: { goal: string; draft: Draft | null; plans: Plans }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const steps = draft ? draft.phases.reduce((n, p) => n + p.steps.length, 0) : 0;
  const approve = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }) });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ ok: false, text: out?.message ?? 'The plan wasn’t saved. Nothing changed.' }); return; }
      setPlans(out.plans);
      setMsg({ ok: true, text: 'Plan approved and saved below. Anything that moves money, signs, files or goes public still comes to you in Approvals.' });
    } catch { setMsg({ ok: false, text: 'Couldn’t reach the server. Nothing changed.' }); } finally { setBusy(false); }
  };
  const saved = plans.some((p) => p.goal === goal);
  return (
    <>
      <p className={o.crumb}><Link href="/">Home</Link> / Plan</p>
      <PageTitle>{draft ? draft.title : 'What are you working on?'}</PageTitle>
      <p className={o.sub}>{draft ? <>You asked: &ldquo;{goal}&rdquo;. Built from what the agents found open, in order. Each step links to where it&apos;s done.</>
        : 'Tell me a goal in your own words. I’ll build a plan from what the agents have found, for you to approve.'}</p>
      <GoalBox onSubmit={(g) => router.push(`/plan?goal=${encodeURIComponent(g)}`)} examples={EXAMPLES} placeholder="Get everything registered" />
      {msg && <p className={o.toast} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{msg.text}</p>}
      {draft && (
        <section className={s.draft} aria-labelledby="draft-h">
          <h2 id="draft-h" className="visually-hidden">The plan</h2>
          {draft.empty ? <p className={o.small}>{draft.empty} {!draft.assumptions.length ? null : <Link href="/departments" className={o.linkInline}>Departments</Link>}</p> : (
            <ol className={s.phases}>
              {draft.phases.map((ph) => (
                <li key={ph.name} className={s.phase}>
                  <h3 className={s.phaseName}>{ph.name}</h3>
                  <ul className={s.steps}>
                    {ph.steps.map((st) => (
                      <li key={st.key} className={s.step}>
                        <Link href={st.href} className={o.linkInline}>{st.title}</Link>
                        <span className={o.small}>{st.agent}{st.waitingOnYou ? ' · waiting on your approval' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {draft.assumptions.length > 0 && (
            <section aria-labelledby="as-h">
              <h3 id="as-h" className={o.eyebrow}>What I assumed</h3>
              <ul className={o.small}>{draft.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}
          {steps > 0 && <div><Button variant="primary" onClick={() => void approve()} disabled={busy || saved}>{saved ? 'Plan approved' : `Approve the plan (${steps} ${steps === 1 ? 'step' : 'steps'})`}</Button></div>}
        </section>
      )}
      <section className={s.saved} aria-labelledby="plans-h">
        <h2 id="plans-h" className={s.savedTitle}>Your plans</h2>
        {plans.length ? (
          <ul className={s.planList}>
            {plans.map((p) => (
              <li key={p.id} className={s.planCard}>
                <div className={s.planHead}>
                  <span className={s.planName}>{p.title}</span>
                  <span className={o.mono}>{p.done} of {p.total} done</span>
                </div>
                <span className={s.bar} aria-hidden="true"><span className={s.fill} style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} /></span>
                <p className={o.small}>&ldquo;{p.goal}&rdquo; · approved {p.approved}</p>
                <details>
                  <summary className={o.small}>Steps</summary>
                  <ul className={s.steps}>
                    {p.steps.map((st) => (
                      <li key={st.key} className={s.step}>
                        {st.done ? <span className={s.done}><Check size={14} aria-hidden="true" />{st.title} <span className="visually-hidden">(done)</span></span> : <Link href={st.href} className={o.linkInline}>{st.title}</Link>}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        ) : <p className={o.small}>No plans yet. Approve one above and it shows here with its progress.</p>}
      </section>
    </>
  );
}
