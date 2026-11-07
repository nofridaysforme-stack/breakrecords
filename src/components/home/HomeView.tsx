'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { SectionHead } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ApprovalCard, ApprovalConfirmed, type ApprovalSummary } from '@/components/ui/Approval';
import { AgentChip } from '@/components/ui/Status';
import {
  ErrorNotice, GoalBox, GoalCard, LabelHeadBlock, NumbersStrip, PartialNotice, Skeleton, WorkingNote, type NumberTile,
} from '@/components/ui/Blocks';
import { Money } from '@/components/ui/Money';
import { useDecisions } from '@/data/decisions';
import type { HomeData, Scenario } from '@/data/types';
import type { Cents } from '@/lib/money';
import s from './Home.module.css';

type Props = {
  scenario: Scenario;
  home: HomeData;
  numbers: { income: Cents; owed: Cents; recouped: Cents; cash90: Cents; unclaimed: Cents };
  approvals: ApprovalSummary[];
  labelShort: string;
};

/** The quiet agent activity rail (2c). */
export function AgentRail({ feed }: { feed: HomeData['feed'] }) {
  return (
    <>
      <h2 className={s.railHead}>Agent activity</h2>
      <ul className={s.feed} aria-live="polite">
        {feed.map((f) => (
          <li key={f.agent + f.when} className={s.feedItem}>
            <div className={s.feedTop}><AgentChip agent={f.agent} state={f.state} /><span className={s.feedWhen}>{f.when}</span></div>
            <p className={s.feedText}>{f.text}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HomeView({ scenario, home, numbers, approvals, labelShort }: Props) {
  const { pending, approve, undo, proposals, decisions } = useDecisions();
  const [justApproved, setJustApproved] = useState<string | null>(null);
  useEffect(() => {
    if (!justApproved) return;
    const t = setTimeout(() => setJustApproved(null), 5000); // Undo is offered for 5 seconds
    return () => clearTimeout(t);
  }, [justApproved]);

  const open = pending(approvals.map((a) => a.id));
  const waiting: (ApprovalSummary & { href?: string })[] = [...proposals.filter((p) => !decisions[p.id]), ...approvals.filter((a) => open.includes(a.id))];
  const onApprove = (id: string) => { approve([id]); setJustApproved(id); };
  const approvedItem = [...approvals, ...proposals].find((a) => a.id === justApproved);

  const top = (
    <div className={s.top}>
      <form className={s.search} role="search" onSubmit={(e) => e.preventDefault()}>
        <Search size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
        <label htmlFor="cmd" className="visually-hidden">Search or tell me a goal</label>
        <input id="cmd" className={s.searchInput} placeholder="Search or tell me a goal" aria-keyshortcuts="Meta+K Control+K" />
        <kbd className={s.kbd}>⌘K</kbd>
      </form>
      <span className={s.labelName}>{labelShort} <ChevronDown size={12} aria-hidden="true" /></span>
      <div className={s.who}><span className={s.whoDate}>{home.today}</span><span className={s.avatar} aria-label={`Signed in as ${home.user.name}`}>{home.user.initial}</span></div>
    </div>
  );

  // ---------- 3a: first use ----------
  if (scenario === 'empty') {
    return (
      <>
        {top}
        <section className={s.welcome} aria-labelledby="welcome">
          <h1 id="welcome" className={s.welcomeTitle}>Welcome, {home.user.name}. What are you working on?</h1>
          <p className={s.welcomeLede}>Tell me a goal in your own words. I&apos;ll come back with a plan, a budget and dates for you to approve.</p>
          <GoalBox onSubmit={() => undefined} examples={['Plan an EP for May', "Find money I'm owed", 'Set up splits for my band', 'Find grants I qualify for']} />
        </section>
      </>
    );
  }

  // ---------- 3c: loading and agents working ----------
  if (scenario === 'working') {
    return (
      <>
        {top}
        <h1 className="visually-hidden">Home</h1>
        <LabelHeadBlock eyebrow="writing this week's brief" writing />
        <div className={s.skeletons}><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /></div>
        <div className={s.chips}>
          <AgentChip agent="Royalties Agent" state="working" task="importing October statements" boxed />
          <AgentChip agent="Metadata Agent" state="working" boxed />
        </div>
        <WorkingNote>Numbers refresh when the statements finish. Usually under a minute.</WorkingNote>
      </>
    );
  }

  const tiles: NumberTile[] =
    scenario === 'error'
      ? [
          { label: 'Income, Sep', value: <Money cents={841260} />, stale: true },
          { label: 'Owed to payees', value: <Money cents={0} />, stale: true },
          { label: 'Cash, 90 days', value: 'Stale', stale: true },
        ]
      : scenario === 'partial'
        ? [
            { label: 'Income this period', value: <Money cents={numbers.income} />, note: 'Distributor only' },
            { label: 'Owed to payees', value: <Money cents={numbers.owed} /> },
            { label: 'Unclaimed found', gap: 'Connect your PRO to search' },
          ]
        : [
            { label: 'Income this period', mobileLabel: 'Income, Oct', value: <Money cents={numbers.income} />, note: 'Glasshouse, Oct' },
            { label: 'Owed to payees', value: <Money cents={numbers.owed} />, note: `${waiting.some((a) => a.id === 'apr_payout_oct') ? '6 payees, awaiting you' : '6 payees, approved'}` },
            { label: 'Recoupment', value: <Money cents={numbers.recouped} />, note: 'Glasshouse fully recouped' },
            { label: 'Cash, next 90 days', value: <Money cents={numbers.cash90} />, note: 'Forecast, after payouts' },
            { label: 'Unclaimed found', value: <Money cents={numbers.unclaimed} />, note: '2 sources to claim' },
          ];

  const [first, ...otherGoals] = home.goals;

  return (
    <>
      {top}
      {scenario === 'error' ? (
        <>
        <h1 className="visually-hidden">Home</h1>
        <ErrorNotice
          heading="The distributor import failed"
          meta="Error DS-401 · Nov 6, 8:02 · Audit AUD-7F3K-2288"
          actions={<><Button variant="primary">Retry import</Button><Button>Reconnect distributor</Button></>}
        >
          I couldn&apos;t read the October statement. <strong>No money moved and nothing was filed.</strong> Income and forecast below still show September.
        </ErrorNotice>
        </>
      ) : (
        <LabelHeadBlock
          eyebrow="weekly brief"
          shortEyebrow="this week"
          heading={<h1 className={s.greeting}>Good morning, {home.user.name}.</h1>}
          action={<Button variant="onBrand">Ask the Label Head</Button>}
          short="Glasshouse is on track and on budget. Two terms in Marco's agreement need your eyes. A grant closes in 9 days."
        >
          {home.brief}
        </LabelHeadBlock>
      )}

      <section className={s.needs} aria-labelledby="needs">
        <div className={s.needsHead}>
          <SectionHead id="needs">Needs you <span className={s.count}>{waiting.length}</span></SectionHead>
          <Link href="/approvals" className={s.link}><span className={s.deskOnly}>Open approvals</span><span className={s.phoneOnly}>See all</span></Link>
        </div>
        {approvedItem && <ApprovalConfirmed text={`${approvedItem.title} approved. Nothing is sent before ${approvedItem.due}.`} onUndo={() => { undo([approvedItem.id]); setJustApproved(null); }} />}
        {waiting.length === 0 ? (
          <p className={s.note}>Nothing needs you right now.</p>
        ) : (
          <div className={s.cards}>
            {waiting.slice(0, 3).map((a) => <ApprovalCard key={a.id} approval={a} reviewHref={a.href ?? `/approvals/${a.id}`} onApprove={onApprove} />)}
          </div>
        )}
      </section>

      {scenario === 'partial' && <h2 className="visually-hidden">This period</h2>}
      <NumbersStrip tiles={tiles} mobileCount={2} label={scenario === 'partial' ? 'This period' : 'Key numbers'} />
      {scenario === 'partial' && (
        <PartialNotice action={<Button variant="primary">Connect</Button>}>
          <strong>Your PRO and SoundExchange aren&apos;t connected.</strong> Performance royalties aren&apos;t in these numbers yet.
        </PartialNotice>
      )}

      <div className={s.lower}>
        <section className={s.col} aria-labelledby="goals">
          <SectionHead id="goals" className={s.goalsHead}>Active goals</SectionHead>
          <div className={`${s.col} ${s.goals}`}>
            {scenario === 'blocked' ? (
              <GoalCard
                title={first.title} pct={first.pct}
                blocked={{
                  reason: <><strong>Delivery can&apos;t start.</strong> The split sheet needs Marco Dela&apos;s signature. Legal Agent sent it Nov 9 and reminded him Nov 12.</>,
                  actions: <><Button variant="primary">Send another reminder</Button><ButtonLink href={first.href ?? '/releases'}>Open runbook</ButtonLink></>,
                }}
              />
            ) : (
              <Link href={first.href ?? '/releases'} className={s.goalLink}>
                <GoalCard title={first.title} pct={first.pct} meta={first.meta} metaShort="Mar 6 · $1,860 of $3,000" />
                <span className="visually-hidden">Open runbook</span>
              </Link>
            )}
            {otherGoals.map((g) => <GoalCard key={g.id} title={g.title} pct={g.pct} meta={g.meta} />)}
          </div>
          {scenario === 'blocked' && <p className={s.note}>If it isn&apos;t signed by Jan 9, I&apos;ll suggest moving the release date.</p>}
        </section>
        <section className={`${s.col} ${s.datesCol}`} aria-labelledby="dates">
          <SectionHead id="dates">Coming up</SectionHead>
          <ul className={s.dates}>
            {home.dates.map((d) => (
              <li key={d.title} className={s.date}>
                <span className={s.dateDay}>{d.date}</span>
                <span><span className={s.dateTitle} style={{ display: 'block' }}>{d.title}</span><span className={s.dateMeta}>{d.meta}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
