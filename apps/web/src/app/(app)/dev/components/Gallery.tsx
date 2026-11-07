'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Body, Eyebrow, Hero, PageTitle, SectionHead } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  AgentChip, Preparing, RiskFlag, StatusPill, TaskFlag, TypeGlyph, approvalTypeLabel, type ApprovalType,
} from '@/components/ui/Status';
import {
  ApprovalBlocked, ApprovalCard, ApprovalConfirmed, ApprovalFailed, ApprovalGroup, ApprovalPreparing, ApprovalRow,
  BulkBar, canBulkApprove,
} from '@/components/ui/Approval';
import { Checkbox, ProgressBar, Term, UnderlineTabs } from '@/components/ui/Controls';
import { AutonomyDial, type Autonomy } from '@/components/ui/AutonomyDial';
import { Money, Waterfall } from '@/components/ui/Money';
import { SplitBar, SplitTree, type SplitNode } from '@/components/ui/Splits';
import {
  EmptyState, ErrorNotice, EvidencePanel, GateLock, GoalBox, GoalCard, LabelHeadBlock, MarketRangeWarning,
  NumbersStrip, PartialNotice, PlanPreview, RunbookTask, Skeleton, VerifiedStamp, WorkingNote,
} from '@/components/ui/Blocks';
import { approvals, artistNet, glasshouseWaterfall, payoutBatch, splitV4, splitV5 } from '@/data/sample';
import { formatMoney } from '@breakrecords/core/money';
import s from './page.module.css';

function Section({ title, frames, children }: { title: string; frames: string; children: ReactNode }) {
  return (
    <section className={s.section} aria-label={title}>
      <div className={s.head}><SectionHead>{title}</SectionHead><span className={s.frames}>{frames}</span></div>
      {children}
    </section>
  );
}

const Label = ({ children }: { children: ReactNode }) => <p className={s.label}>{children}</p>;

const tree: SplitNode[] = [{
  id: 'northline', label: 'Northline Records', children: [
    { id: 'kesi', label: 'Kesi Vale', children: [{ id: 'glasshouse', label: 'Glasshouse (single)', children: [
      { id: 'gh-rec', label: 'Recording income', override: true }, { id: 'gh-song', label: 'Song income' }, { id: 'gh-sync', label: 'Sync' },
    ] }] },
    { id: 'low-hours', label: 'The Low Hours', children: [{ id: 'night-bus', label: 'Night Bus EP', children: [{ id: 'nb-rec', label: 'Recording income' }] }] },
    { id: 'marco', label: 'Marco Dela', children: [{ id: 'marco-prod', label: 'Production credits' }] },
  ],
}];

export function Gallery() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['apr_payout_oct', 'apr_mlc']));
  const [approved, setApproved] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const [dial, setDial] = useState<Autonomy>('draft_and_wait');
  const [dial2, setDial2] = useState<Autonomy>('draft_and_wait');
  const [node, setNode] = useState('gh-rec');
  const [demoCheck, setDemoCheck] = useState(true);

  const toggle = (id: string) => setSelected((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const types: ApprovalType[] = ['money', 'signature', 'filing', 'public', 'plan'];
  const counts = useMemo(() => Object.fromEntries(types.map((t) => [t, approvals.filter((a) => a.type === t).length])), []);
  const shown = types.filter((t) => tab === 'all' || tab === t);
  const selItems = approvals.filter((a) => selected.has(a.id) && canBulkApprove(a));

  return (
    <>
      <div>
        <PageTitle>Components</PageTitle>
        <Body className={s.p}>Every Phase B component in every state from components.md, with the frame it comes from. Compare against design/screenshots.</Body>
      </div>

      <Section title="Buttons" frames="components.md · 2c 2e 3a">
        <div className={s.row}>
          <Button variant="primary">Approve</Button>
          <Button>Review</Button>
          <Button variant="primary" size="lg">Approve and send {formatMoney(payoutBatch.total)}</Button>
          <ButtonLink href="#" variant="secondary">Edit then approve</ButtonLink>
          <Button variant="primary" disabled disabledReason="Open the agreement to review and sign it." id="demo-dis">Approve</Button>
          <span className={s.p}>Signatures are approved one at a time.</span>
        </div>
        <div className={s.row} style={{ background: 'var(--brand)', padding: 16, borderRadius: 'var(--r-card)' }}>
          <Button variant="onBrand">Ask the Label Head</Button>
        </div>
        <div className={s.row}>
          <Button variant="primary">Approve and send $1,240.18</Button>
          <Button>Edit then approve</Button>
          <Button>Ask the agent</Button>
          <Button variant="destructive">Reject with reason</Button>
        </div>
      </Section>

      <Section title="Status, risk and agents" frames="tokens.json > status · 2c 2d 2g 3c 3d 5f">
        <div><Label>Status pill</Label><div className={s.row}>
          {(['notStarted', 'prepared', 'needsYou', 'submitted', 'confirmed', 'blocked'] as const).map((st) => <StatusPill key={st} status={st} />)}
        </div></div>
        <div><Label>Risk flag</Label><div className={s.row}>
          <RiskFlag risk="low" /><RiskFlag risk="dueSoon" label="Due in 9 days" /><RiskFlag risk="needsEyes" /><RiskFlag risk="blocked" strong />
          <RiskFlag risk="low" eyebrow /><RiskFlag risk="needsEyes" eyebrow />
        </div></div>
        <div><Label>Task flag (runbook)</Label><div className={s.row}>
          {(['done', 'inProgress', 'needsYou', 'waiting', 'locked'] as const).map((t) => <TaskFlag key={t} state={t} />)}
        </div></div>
        <div><Label>Agent chip</Label><div className={s.row}>
          <AgentChip agent="Royalties Agent" state="idle" /><AgentChip agent="Release Agent" state="working" />
          <AgentChip agent="Audit Agent" state="waitingOnYou" /><AgentChip agent="Audit Agent" state="blocked" />
          <AgentChip agent="Funding Scout" state="done" />
          <AgentChip agent="Royalties Agent" state="working" task="importing October statements" boxed />
          <Preparing />
        </div></div>
        <div><Label>Approval type glyphs</Label><div className={s.row}>
          {types.map((t) => <span key={t} className={s.p} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TypeGlyph type={t} />{approvalTypeLabel(t)}</span>)}
        </div></div>
        <div className={s.row}>
          <Checkbox checked={demoCheck} onChange={() => setDemoCheck(!demoCheck)} aria-label="Demo checkbox" />
          <Checkbox checked={false} disabled aria-label="Disabled checkbox" />
          <div style={{ width: 240 }}><ProgressBar value={62} label="62% of tasks done" /></div>
          <span className={s.p}>Terms: <Term term="ISRC" />, <Term term="MLC" />, <Term term="PRO" />, <Term term="SoundExchange" /></span>
        </div>
      </Section>

      <Section title="Approval card" frames="2c · 3d preparing · 3f blocked · 3h failed">
        <div className={s.grid3}>
          {approvals.slice(0, 3).map((a) => (
            <ApprovalCard key={a.id} approval={a} reviewHref={`/approvals/${a.id}`} onApprove={(id) => setApproved(id)} />
          ))}
        </div>
        <div className={s.grid2}>
          <div className={s.stack}>
            <ApprovalPreparing title="Payout batch for October" agent="Royalties Agent" eta="ready in about 2 minutes" />
            {approved
              ? <ApprovalConfirmed text={`${approvals.find((a) => a.id === approved)?.title} approved. Sends Nov 10.`} onUndo={() => setApproved(null)} />
              : <ApprovalConfirmed text="Payout batch for October approved. Sends Nov 10." onUndo={() => undefined} />}
          </div>
          <ApprovalBlocked
            approval={{ id: 'blocked-demo', type: 'money', title: 'Payout batch for October', due: 'Nov 10' }}
            reason={<>Can&apos;t approve yet. <strong>Rue Sato&apos;s tax form is missing</strong>, so her $214.20 would need 24% withheld. Owner: Rue Sato.</>}
            fix={{ label: 'Ask Rue for a W-9' }}
            alternative={{ label: 'Pay the other 5 now' }}
          />
        </div>
        <ApprovalFailed
          heading="Payout partly failed"
          body={<>5 of 6 payments sent ($1,025.98). <strong>Theo Lind&apos;s $214.20 bounced</strong>; the bank details look out of date. The money is back in the balance.</>}
          fix={{ label: 'Ask Theo to update details' }}
          retry={{ label: 'Retry payment' }}
        />
      </Section>

      <Section title="Approval inbox" frames="2d · rows, groups, bulk bar, tabs">
        <UnderlineTabs
          label="Approval type"
          value={tab}
          onChange={setTab}
          items={[{ value: 'all', label: 'All', count: approvals.length }, ...types.map((t) => ({ value: t, label: approvalTypeLabel(t), count: counts[t] }))]}
        >
          <div className={s.stack} style={{ gap: 18, paddingTop: 18 }}>
            <BulkBar
              count={selItems.length}
              summary={selItems.map((a) => (a.type === 'money' ? `${formatMoney(payoutBatch.total)} payout` : `1 ${a.type}`)).join(' and ')}
              onClear={() => setSelected(new Set())}
              onApprove={() => setSelected(new Set())}
            />
            {shown.map((t) => (
              <ApprovalGroup key={t} type={t} count={counts[t]} emptyText="Nothing public is waiting. Phase 2 marketing will route posts and press here.">
                {approvals.filter((a) => a.type === t).map((a) => (
                  <ApprovalRow key={a.id} approval={a} selected={selected.has(a.id)} onToggle={toggle} reviewHref={`/approvals/${a.id}`} />
                ))}
              </ApprovalGroup>
            ))}
          </div>
        </UnderlineTabs>
      </Section>

      <Section title="Autonomy dial" frames="5f segmented · 2b list">
        <AutonomyDial
          value={dial} onChange={setDial}
          note={'"Act within limits" is available for Royalties: it can match statement lines and fix metadata typos on its own. Payouts still come to you.'}
        />
        <AutonomyDial value={dial} onChange={setDial} legend="Autonomy, Legal" disabled={{ act_within_limits: 'Set a spend cap first to unlock this.' }} />
        <div style={{ maxWidth: 760 }}>
          <AutonomyDial layout="list" value={dial2} onChange={setDial2} recommended="draft_and_wait" legend="How much should your staff do alone?" />
        </div>
      </Section>

      <Section title="Money and waterfall" frames="components.md · 4c">
        <p className={s.p}>
          Kesi Vale nets{' '}
          <Money cents={artistNet} waterfall={{ title: 'Kesi Vale · Glasshouse · October', rows: glasshouseWaterfall, totalLabel: 'Kesi Vale nets' }} />.
          {' '}Negative: <Money cents={-50000} />. Non-USD: <Money cents={120000} currency="CAD" />. Headline: <Money cents={300000} wholeIfRound />.
        </p>
        <Waterfall rows={glasshouseWaterfall} totalLabel="Kesi Vale nets" caption="How Kesi Vale's October earnings were calculated" />
      </Section>

      <Section title="Splits" frames="4a · split bar, tree, market range">
        <div className={s.splits}>
          <div className={s.treeCol}><SplitTree nodes={tree} selectedId={node} onSelect={setNode} /></div>
          <div className={s.stack} style={{ gap: 18 }}>
            <SplitBar title="Version 4 · in effect since Oct 1, 2026" parties={splitV4} />
            <SplitBar
              title="Draft version 5 · effective Jan 1, 2027" parties={splitV5} table={false}
              note="You raised Kesi to 55% and lowered the label to 40%. Assign the missing share before sending. Payouts under v5 stay in suspense until every party signs."
            />
            <div style={{ maxWidth: 360 }}>
              <MarketRangeWarning verified={{ date: 'Oct 28, 2026', href: '#' }}>
                Producer points are usually 2 to 4 on an indie single. Marco&apos;s 3 is in range. Points are taken before the net profit split, so they reduce both shares.
              </MarketRangeWarning>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Runbook rows and gate lock" frames="2g">
        <ul className={s.stack} style={{ maxWidth: 600 }}>
          <RunbookTask title="Producer agreement, Marco Dela" owner="Legal Agent" state="needsYou" />
          <RunbookTask title="Budget approved, $3,000" owner="Label Head" state="done" />
          <RunbookTask title="Pitch draft" owner="Release Agent" state="inProgress" />
          <GateLock title="Split sheets signed (2 of 3)" owner="Legal" waitingOn="Marco Dela" met={false} />
          <RunbookTask title="Masters delivered" owner="Kesi Vale" state="waiting" />
          <GateLock title="Masters accepted" owner="Distribution Agent" met />
        </ul>
        <VerifiedStamp date="Oct 28, 2026" href="#" />
      </Section>

      <Section title="Evidence drawer" frames="2e">
        <div className={s.panel}>
          <EvidencePanel
            why={{ label: 'Why this batch', text: 'I applied the signed split versions to October income, carried forward anyone under the $25 minimum and checked every payee has a valid tax form. Two payees were carried forward and are not in this batch.' }}
            inputs={[
              { label: 'Distributor statement, Oct', ref: 'DS-1026', href: '#' }, { label: 'SoundExchange, Q3', ref: 'SX-Q3-26', href: '#' },
              { label: 'Glasshouse splits', ref: 'v4 signed', href: '#' }, { label: 'Night Bus splits', ref: 'v2 signed', href: '#' },
            ]}
            steps={['Imported 1,231 statement lines', 'Matched 1,204 lines to recordings', 'Applied split versions in effect Oct 1 to 31', 'Checked tax forms for 8 payees']}
            auditId="AUD-7F3K-2291" logHref="/activity" onClose={() => undefined}
          />
        </div>
      </Section>

      <Section title="Label Head, goal box and plan preview" frames="2c · 3a · 3c · undrawn plan preview">
        <LabelHeadBlock eyebrow="weekly brief" heading={<Hero as="h2">Good morning, Jana.</Hero>} action={<Button variant="onBrand">Ask the Label Head</Button>}>
          Glasshouse is on track for March 5 and on budget. I drafted the producer agreement for Marco Dela; two terms need your eyes.
        </LabelHeadBlock>
        <LabelHeadBlock eyebrow="writing this week's brief" writing />
        <GoalBox onSubmit={() => undefined} examples={['Plan an EP for May', "Find money I'm owed", 'Set up splits for my band', 'Find grants I qualify for']} />
        <PlanPreview
          goal="Release a single March 5 on a $3,000 budget" budget="$3,000" dates="Jan 8 to Jun 3" approvals={6}
          phases={[
            { name: '8 weeks out', date: 'Jan 8', tasks: [{ title: 'Split sheets signed', owner: 'Legal Agent' }, { title: 'Masters delivered', owner: 'Kesi Vale' }] },
            { name: '4 weeks out', date: 'Feb 5', tasks: [{ title: 'Metadata complete', owner: 'Metadata Agent' }, { title: 'Deliver to distributor', owner: 'Distribution Agent' }] },
            { name: 'Release week', date: 'Mar 5', tasks: [{ title: 'Release goes live', owner: 'Distribution Agent' }] },
          ]}
          onApprove={() => undefined} onChange={() => undefined}
        />
      </Section>

      <Section title="States" frames="3a to 3j · flows.md > States">
        <div className={s.grid2}>
          <div className={s.stack}>
            <Label>Empty (3b)</Label>
            <EmptyState title="Nothing needs you right now" action={<Button>See what agents are doing</Button>}>
              Your staff are working on 6 tasks. The next approval I expect is the MLC filing for The Low Hours, around Nov 20.
            </EmptyState>
          </div>
          <div className={s.stack}>
            <Label>Loading and working (3c, 3d)</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} />
            </div>
            <div className={s.row}>
              <AgentChip agent="Royalties Agent" state="working" task="importing October statements" boxed />
              <AgentChip agent="Metadata Agent" state="working" boxed />
            </div>
            <WorkingNote>Numbers refresh when the statements finish. Usually under a minute.</WorkingNote>
          </div>
          <div className={s.stack}>
            <Label>Blocked goal (3e)</Label>
            <GoalCard
              title="Glasshouse single" pct={62}
              blocked={{
                reason: <><strong>Delivery can&apos;t start.</strong> The split sheet needs Marco Dela&apos;s signature. Legal Agent sent it Nov 9 and reminded him Nov 12.</>,
                actions: <><Button variant="primary">Send another reminder</Button><ButtonLink href="/releases">Open runbook</ButtonLink></>,
              }}
            />
            <GoalCard title="Register catalog with MLC" pct={58} meta="7 of 12 songs · 3 waiting on you" />
          </div>
          <div className={s.stack}>
            <Label>Error (3g)</Label>
            <ErrorNotice
              heading="The distributor import failed"
              meta="Error DS-401 · Nov 6, 8:02 · Audit AUD-7F3K-2288"
              actions={<><Button variant="primary">Retry import</Button><Button>Reconnect distributor</Button></>}
            >
              I couldn&apos;t read the October statement. <strong>No money moved and nothing was filed.</strong> Income and forecast below still show September.
            </ErrorNotice>
            <NumbersStrip tiles={[
              { label: 'Income, Sep', value: <Money cents={841260} />, stale: true },
              { label: 'Owed to payees', value: <Money cents={0} />, stale: true },
              { label: 'Cash, 90 days', value: 'Stale', stale: true },
            ]} />
          </div>
          <div className={s.stack}>
            <Label>Partial data (3i)</Label>
            <NumbersStrip tiles={[
              { label: 'Income this period', value: <Money cents={1000000} />, note: 'Distributor only' },
              { label: 'Owed to payees', value: <Money cents={payoutBatch.total} /> },
              { label: 'Unclaimed found', gap: 'Connect your PRO to search' },
            ]} />
            <PartialNotice action={<Button variant="primary">Connect</Button>}>
              <strong>Your PRO and SoundExchange aren&apos;t connected.</strong> Performance royalties aren&apos;t in these numbers yet.
            </PartialNotice>
          </div>
          <div className={s.stack}>
            <Label>Partial data (3j)</Label>
            <PartialNotice action={<Button variant="primary">Connect</Button>}>
              <strong>E-signature isn&apos;t connected.</strong> Agreements will wait here as drafts until it is.
            </PartialNotice>
            <ApprovalPreparing title="Producer agreement, Marco Dela" agent="Legal Agent" eta="draft ready, can't send yet" flag={<TaskFlag state="waiting" label="Draft" />} />
          </div>
        </div>
      </Section>

      <Eyebrow as="p">End of components</Eyebrow>
    </>
  );
}
