'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { GoalBox, PlanPreview } from '@/components/ui/Blocks';
import { useDecisions } from '@/data/decisions';
import { draftPlan } from '@/lib/plan';
import { formatMoney } from '@/lib/money';
import o from '@/components/ops/Ops.module.css';

/** A goal from ⌘K or the Home goal box becomes a plan preview (flows.md > Core loop, step 2). */
export function PlanView({ goal, today }: { goal: string; today: string }) {
  const router = useRouter();
  const plan = useMemo(() => (goal ? draftPlan(goal, today) : null), [goal, today]);
  const { propose, approve, decisions } = useDecisions();
  const [editing, setEditing] = useState(false);
  const id = `plan_goal_${goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  const approved = decisions[id]?.status === 'approved';

  if (!plan || editing) {
    return (
      <>
        <PageTitle>{plan ? 'Change the goal' : 'What are you working on?'}</PageTitle>
        <p className={o.sub}>Tell me a goal in your own words. I&apos;ll come back with a plan, a budget and dates for you to approve.</p>
        <GoalBox onSubmit={(g) => { setEditing(false); router.push(`/plan?goal=${encodeURIComponent(g)}`); }} examples={['Plan an EP for May', "Find money I'm owed", 'Set up splits for my band', 'Find grants I qualify for']} />
      </>
    );
  }

  return (
    <>
      <p className={o.crumb}><Link href="/">Home</Link> / Plan</p>
      <h1 className="visually-hidden">Plan preview: {plan.title}</h1>
      <p className={o.sub} style={{ marginTop: 0 }}>You asked: &ldquo;{goal}&rdquo;</p>
      {approved ? (
        <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />Plan approved. I&apos;m setting up the tasks. Anything that moves money, signs, files or goes public still comes back to you in <Link href="/approvals" className={o.linkInline}>Approvals</Link>.</p>
      ) : null}
      <PlanPreview
        goal={plan.title}
        budget={plan.budget !== null ? formatMoney(plan.budget, { wholeIfRound: true }) : 'none needed'}
        dates={plan.dates}
        approvals={plan.approvals}
        phases={plan.phases}
        onChange={() => setEditing(true)}
        onApprove={() => {
          if (approved) return;
          propose({ id, type: 'plan', title: plan.title, agent: 'Label Head', due: plan.phases[0].date, impact: `${plan.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks`, risk: 'low', context: 'New goal', href: `/plan?goal=${encodeURIComponent(goal)}`, artists: [], releases: [], dept: 'Release' });
          approve([id]);
        }}
      />
      {plan.assumptions.length > 0 && (
        <section className={o.section} aria-labelledby="as-h">
          <h2 id="as-h" className={o.eyebrow}>What I assumed</h2>
          <ul className={o.small} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}
    </>
  );
}
