'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  ApprovalBlocked, ApprovalCard, ApprovalConfirmed, ApprovalFailed, ApprovalGroup, ApprovalPreparing, ApprovalRow,
  BulkBar, canBulkApprove, type ApprovalSummary,
} from '@/components/ui/Approval';
import { approvalTypeLabel, TaskFlag, type ApprovalType } from '@/components/ui/Status';
import { UnderlineTabs } from '@/components/ui/Controls';
import { EmptyState, PartialNotice, Skeleton, WorkingNote } from '@/components/ui/Blocks';
import { useDecisions } from '@/data/decisions';
import type { Scenario } from '@/data/types';
import { formatMoney } from '@breakrecords/core/money';
import s from './Inbox.module.css';

export type InboxItem = ApprovalSummary & { artists: string[]; releases: string[]; dept: string; short?: string; href?: string };

const TYPES: ApprovalType[] = ['money', 'signature', 'filing', 'public', 'plan'];
const SHORT: Partial<Record<ApprovalType, string>> = { signature: 'Sign' }; // 2i chip label

type Props = { scenario: Scenario; items: InboxItem[]; payoutTotal: number };

const hrefOf = (a: InboxItem) => a.href ?? `/approvals/${a.id}`;

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className={s.filter}>
      <span className={s.filterKey}>{label}</span>
      <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="All">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className={s.chev} size={12} aria-hidden="true" />
    </label>
  );
}

export function InboxView({ scenario, items: serverItems, payoutTotal }: Props) {
  const { pending, approve, undo, proposals, checks } = useDecisions();
  const router = useRouter();
  const items: InboxItem[] = useMemo(() => [
    // Approvals created in the app come first, as on Home, so the phone's first 3 include them.
    ...(scenario === 'empty' ? [] : proposals.map((p) => ({ ...p, artists: p.artists ?? ['Kesi Vale'], releases: p.releases ?? ['Glasshouse'], dept: p.dept ?? 'Release' }))),
    ...serverItems,
  ], [serverItems, proposals, scenario]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<string>('all');
  const [filters, setFilters] = useState({ artist: 'All', release: 'All', dept: 'All' });
  const [confirmed, setConfirmed] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => setConfirmed(null), 5000);
    return () => clearTimeout(t);
  }, [confirmed]);

  // In the blocked (3f) and failed (3h) states the payout is not an ordinary pending row.
  const special = scenario === 'blocked' || scenario === 'error' ? 'apr_payout_oct' : null;
  const open = pending(items.map((a) => a.id));
  const waiting = items.filter((a) => open.includes(a.id) && a.id !== special);
  const matches = (a: InboxItem) =>
    (filters.artist === 'All' || a.artists.includes(filters.artist)) &&
    (filters.release === 'All' || a.releases.includes(filters.release)) &&
    (filters.dept === 'All' || a.dept === filters.dept);
  // Cards with a failed Block check sit at the top under "Can't approve yet", with their reasons.
  const cantApprove = (a: InboxItem) => checks?.[a.id] ? !checks[a.id].canApprove : false;
  const stuck = waiting.filter(matches).filter(cantApprove);
  const visible = waiting.filter(matches).filter((a) => !cantApprove(a));
  const specialItem = items.find((a) => a.id === special);
  const specialCount = specialItem && matches(specialItem) ? 1 : 0;
  const shownTypes = TYPES.filter((t) => tab === 'all' || tab === t);
  const count = (t: ApprovalType) => visible.filter((a) => a.type === t).length + (t === 'money' ? specialCount : 0);
  const stuckOf = (t: ApprovalType) => stuck.filter((a) => a.type === t);
  const selItems = visible.filter((a) => selected.has(a.id) && canBulkApprove(a));
  const opts = useMemo(() => ({
    artist: [...new Set(items.flatMap((a) => a.artists))],
    release: [...new Set(items.flatMap((a) => a.releases))],
    dept: [...new Set(items.map((a) => a.dept))],
  }), [items]);

  const decide = (ids: string[]) => { approve(ids); setConfirmed(ids); setSelected((sel) => { const n = new Set(sel); ids.forEach((i) => n.delete(i)); return n; }); };
  const toggle = (id: string) => setSelected((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const summary = selItems.map((a) => (a.type === 'money' ? `${formatMoney(payoutTotal)} payout` : `1 ${a.type}`)).join(' and ');
  const confirmText = confirmed && (confirmed.length === 1
    ? `${items.find((a) => a.id === confirmed[0])?.title} approved. Nothing is sent before ${items.find((a) => a.id === confirmed[0])?.due}.`
    : `${confirmed.length} items approved. Nothing is sent before its due date.`);

  const total = waiting.length + (special ? 1 : 0);
  const stuckCard = (a: InboxItem) => {
    const failed = checks![a.id].results.filter((r) => r.status === 'fail' && r.severity === 'block');
    return (
      <ApprovalBlocked
        key={a.id}
        approval={{ id: a.id, type: a.type, title: a.title, due: a.due }}
        reason={<><strong>{failed.length} {failed.length === 1 ? 'check' : 'checks'} failed.</strong> {failed[0].id}: {failed[0].message}</>}
        fix={{ label: 'See why', onClick: () => router.push(hrefOf(a)) }}
      />
    );
  };
  const stuckCards = stuck.length > 0 && (
    <section className={s.stuck} aria-labelledby="stuck-h">
      <h2 id="stuck-h" className={s.stuckHead}>Can&apos;t approve yet <span>· {stuck.length}</span></h2>
      {stuck.map(stuckCard)}
    </section>
  );
  const subtitle = `${total} ${total === 1 ? 'decision' : 'decisions'} waiting. Nothing moves until you approve.`;

  // ---------- states with no list ----------
  if (scenario === 'empty' || (scenario === 'default' && waiting.length === 0 && !confirmed)) {
    return (
      <>
        <PageTitle>Approvals</PageTitle>
        <EmptyState title="Nothing needs you right now" action={<ButtonLink href="/activity">See what agents are doing</ButtonLink>}>
          Your staff are working on 6 tasks. The next approval I expect is the MLC filing for The Low Hours, around Nov 20.
        </EmptyState>
      </>
    );
  }
  if (scenario === 'working') {
    return (
      <>
        <PageTitle>Approvals</PageTitle>
        <div className={s.stack} aria-busy="true">
          <ApprovalPreparing title="Payout batch for October" agent="Royalties Agent" eta="ready in about 2 minutes" />
          <Skeleton height={72} />
          <Skeleton height={72} faded />
          <WorkingNote>I&apos;ll let you know when these are ready. You don&apos;t need to wait here.</WorkingNote>
        </div>
      </>
    );
  }

  // The blocked (3f) or failed (3h) payout lives in the Money group.
  const specialCard: ReactNode = (
    <>
      {scenario === 'blocked' && (
        <ApprovalBlocked
          approval={{ id: 'apr_payout_oct', type: 'money', title: 'Payout batch for October', due: 'Nov 10' }}
          reason={<>Can&apos;t approve yet. <strong>Rue Sato&apos;s tax form is missing</strong>, so her $214.20 would need 24% withheld. Owner: Rue Sato.</>}
          fix={{ label: 'Ask Rue for a W-9' }}
          alternative={{ label: 'Pay the other 5 now' }}
        />
      )}
      {scenario === 'error' && (
        <ApprovalFailed
          heading="Payout partly failed"
          body={<>5 of 6 payments sent ($1,025.98). <strong>Theo Lind&apos;s $214.20 bounced</strong>; the bank details look out of date. The money is back in the balance.</>}
          fix={{ label: 'Ask Theo to update details' }}
          retry={{ label: 'Retry payment' }}
        />
      )}
    </>
  );

  const banner: ReactNode = (
    <>
      {scenario === 'partial' && (
        <PartialNotice action={<Button variant="primary">Connect</Button>}>
          <strong>E-signature isn&apos;t connected.</strong> Agreements will wait here as drafts until it is.
        </PartialNotice>
      )}
      {confirmText && <ApprovalConfirmed text={confirmText} onUndo={() => { undo(confirmed!); setConfirmed(null); }} />}
    </>
  );

  // Signature items become drafts when e-signature is not connected (3j).
  const row = (a: InboxItem) =>
    scenario === 'partial' && a.type === 'signature'
      ? <ApprovalPreparing key={a.id} title={a.title} agent={a.agent} eta="draft ready, can't send yet" flag={<TaskFlag state="waiting" label="Draft" />} />
      : <ApprovalRow key={a.id} approval={a} selected={selected.has(a.id)} onToggle={toggle} reviewHref={hrefOf(a)} onApprove={(id) => decide([id])} />;

  const phoneItems = visible.filter((a) => tab === 'all' || a.type === tab);
  const phoneShown = showAll ? phoneItems : phoneItems.slice(0, 3);
  const hidden = phoneItems.slice(3);

  return (
    <>
      {/* ---------- desktop and tablet (2d) ---------- */}
      <div className={s.desk}>
        <div className={s.head}>
          <div>
            <PageTitle>Approvals</PageTitle>
            <p className={s.sub}>{subtitle}</p>
          </div>
          <div className={s.filters}>
            <Filter label="Artist" value={filters.artist} options={opts.artist} onChange={(v) => setFilters({ ...filters, artist: v })} />
            <Filter label="Release" value={filters.release} options={opts.release} onChange={(v) => setFilters({ ...filters, release: v })} />
            <Filter label="Dept" value={filters.dept} options={opts.dept} onChange={(v) => setFilters({ ...filters, dept: v })} />
          </div>
        </div>
        <UnderlineTabs
          label="Approval type" value={tab} onChange={setTab}
          items={[{ value: 'all', label: 'All', count: visible.length + stuck.length + specialCount }, ...TYPES.map((t) => ({ value: t, label: approvalTypeLabel(t), count: count(t) + stuckOf(t).length }))]}
        >
          <div className={s.list} style={{ paddingTop: 22 }}>
            {banner}
            {(tab === 'all') && stuckCards}
            <BulkBar count={selItems.length} summary={summary} onClear={() => setSelected(new Set())} onApprove={() => decide(selItems.map((a) => a.id))} />
            {shownTypes.map((t) => (
              <ApprovalGroup key={t} type={t} count={count(t) + stuckOf(t).length} emptyText={t === 'public' ? 'Nothing public is waiting. Phase 2 marketing will route posts and press here.' : `Nothing in ${approvalTypeLabel(t).toLowerCase()} is waiting.`}>
                {t === 'money' && specialCount > 0 && specialCard}
                {tab === 'all' && stuckOf(t).length > 0 && !count(t) && <p className={s.stuckNote}>Waiting above, under Can&apos;t approve yet.</p>}
                {tab !== 'all' && stuckOf(t).map(stuckCard)}
                {visible.filter((a) => a.type === t).map(row)}
              </ApprovalGroup>
            ))}
          </div>
        </UnderlineTabs>
      </div>

      {/* ---------- phone (2i): one-handed, no swipe ---------- */}
      <div className={s.phone}>
        <h1 className={s.phoneTitle}>Approvals</h1>
        <div className={s.chips} role="group" aria-label="Approval type">
          {[['all', 'All', visible.length + specialCount] as const, ...TYPES.filter((t) => count(t) > 0).map((t) => [t, SHORT[t] ?? approvalTypeLabel(t), count(t)] as const)].map(([v, l, n]) => (
            <button key={v} type="button" className={s.chip} aria-pressed={tab === v} onClick={() => setTab(v)}>{l} {n}</button>
          ))}
        </div>
        {banner}
        {tab === 'all' && stuckCards}
        {specialCount > 0 && (tab === 'all' || tab === 'money') && specialCard}
        {phoneShown.map((a) => <ApprovalCard key={a.id} approval={a} phone="inbox" reviewHref={hrefOf(a)} onApprove={(id) => decide([id])} />)}
        {!showAll && hidden.length > 0 && (
          <button type="button" className={s.more} onClick={() => setShowAll(true)}>
            {hidden.length} more below · {hidden[0].short ?? hidden[0].title}, due {hidden[0].due}
          </button>
        )}
      </div>
    </>
  );
}
