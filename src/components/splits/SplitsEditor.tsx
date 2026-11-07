'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MarketRangeWarning } from '@/components/ui/Blocks';
import { Money } from '@/components/ui/Money';
import { SplitBar, SplitTree, type SplitNode, type SplitParty } from '@/components/ui/Splits';
import { Eyebrow } from '@/components/type/Type';
import { deriveShares, type DealTerms } from '@/lib/dealSplit';
import { formatPercent, type Bp } from '@/lib/percent';
import { pctOf } from '@/lib/splits';
import type { glasshouseDeal } from '@/data/money';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import type { Scenario } from '@/data/types';
import s from './SplitsEditor.module.css';

type Deal = typeof glasshouseDeal;
type Props = { tree: SplitNode[]; nodeId: string; nodeLabel: string; parentLabel: string | null; deal: Deal | null; scenario?: Scenario };

const RULES = {
  producer: 'Producer, 3 points off the top',
  label: (t: DealTerms) => `${formatPercent(t.labelOfNetBp)} of net profit`,
  artist: (t: DealTerms) => `${formatPercent(t.artistOfNetBp)} of net profit, less feature`,
  feature: (t: DealTerms) => `Feature, ${formatPercent(t.featureOfArtistBp)} of artist share`,
};

function parties(t: DealTerms, signed: Record<string, string> | null): SplitParty[] {
  const d = deriveShares(t);
  const row = (party: string, short: string, bp: Bp, rule: string, color: SplitParty['color']) => ({ party, short, bp, rule, color, signed: signed ? signed[party] ?? null : null });
  return [
    row('Marco Dela', 'Producer', d.producer, RULES.producer, 1),
    row('Northline Records', 'Label', d.label, RULES.label(t), 2),
    row('Kesi Vale', 'Kesi', d.artist, RULES.artist(t), 3),
    row('Ari Monroe', 'Ari', d.feature, RULES.feature(t), 4),
  ];
}

const KEY = 'br.split.gh-rec.v5';
const pct = (bp: Bp) => String(bp / 100);
const toBp = (v: string) => Math.round(Number(v) * 100);

export function SplitsEditor({ tree, nodeId, nodeLabel, parentLabel, deal, scenario = 'default' }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<DealTerms | null>(deal?.v5.terms ?? null);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [income, setIncome] = useState('10000');
  const preview = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); setDraft(v.terms); setSent(v.sent); } } catch { /* ignore */ }
  }, []);
  const save = (terms: DealTerms, isSent: boolean) => {
    setDraft(terms); setSent(isSent);
    try { sessionStorage.setItem(KEY, JSON.stringify({ terms, sent: isSent })); } catch { /* ignore */ }
  };

  const v4 = useMemo(() => (deal ? parties(deal.v4.terms, deal.v4.signed) : []), [deal]);
  const d5 = draft ? deriveShares(draft) : null;
  const v5 = draft ? parties(draft, null) : [];
  const valid = d5 ? d5.gapOfNetBp === 0 : false;
  const crumb = deal ? deal.breadcrumb.join(' / ') : nodeLabel;

  const treeBlock = (
    <div className={s.treeCol}>
      <SplitTree nodes={tree} selectedId={nodeId} onSelect={(id) => router.push(`/splits/${id}`)} />
    </div>
  );

  if (!deal || !draft || !d5) {
    return (
      <div className={s.layout}>
        {treeBlock}
        <div className={s.main}>
          <div><p className={s.crumb}>{crumb}</p><h1 className={s.title}>Who gets what</h1></div>
          <section className={s.empty}>
            <h2 className={s.emptyTitle}>{nodeLabel} has no split of its own.</h2>
            <p className={s.note}>{parentLabel ? `It inherits the split from ${parentLabel}. Income here pays out the same way.` : 'Pick an income type in the tree to see who gets what.'}</p>
          </section>
        </div>
      </div>
    );
  }

  const gross = Math.max(0, Math.round(Number(income) * 100) || 0);
  const setTerm = (k: keyof DealTerms, v: string) => { const bp = toBp(v); if (!Number.isNaN(bp) && bp >= 0 && bp <= 10000) save({ ...draft, [k]: bp }, false); };

  return (
    <div className={s.layout}>
      {treeBlock}
      <div className={s.main}>
        <div className={s.head}>
          <div style={{ minWidth: 0 }}><p className={s.crumb}>{crumb}</p><h1 className={s.title}>Who gets what</h1></div>
          <div className={s.actions}>
            <Button onClick={() => preview.current?.showModal()}>Preview a payout</Button>
            <Button
              variant="primary" id="send-v5" disabled={!valid || sent}
              disabledReason={sent ? 'Already sent. Waiting on signatures.' : `Assign the missing ${formatPercent(d5.gapOfNetBp)} of net profit first.`}
              onClick={() => save(draft, true)}
            >
              {sent ? 'v5 sent for signatures' : 'Send v5 for signatures'}
            </Button>
          </div>
        </div>

        <ScreenState scenario={scenario} copy={STATES.splits}>
        <SplitBar title={`Version 4 · in effect since ${deal.v4.effective}`} parties={v4} />

        <SplitBar
          title={`Draft version 5 · effective ${deal.v5.effective}`}
          parties={v5}
          table={false}
          gapMessage={`${formatPercent(d5.gapOfNetBp)} of net profit is unassigned`}
          okMessage={sent ? 'Sent for signatures · 0 of 4 signed' : 'Totals 100% · ready to send'}
          note={valid
            ? 'Every share is assigned. Payouts under v5 stay in suspense until every party signs.'
            : `You raised Kesi to ${formatPercent(draft.artistOfNetBp)} and lowered the label to ${formatPercent(draft.labelOfNetBp)}. Assign the missing ${formatPercent(d5.gapOfNetBp)} before sending. Payouts under v5 stay in suspense until every party signs.`}
        />

        {editing ? (
          <fieldset className={s.editor}>
            <legend>Edit draft v5</legend>
            {([
              ['producerBp', 'Producer points, off the top', 'pt'],
              ['labelOfNetBp', 'Label, share of net profit', '%'],
              ['artistOfNetBp', 'Artist, share of net profit', '%'],
              ['featureOfArtistBp', 'Feature, share of artist', '%'],
            ] as const).map(([k, label, unit]) => (
              <label key={k} className={s.field}>{label}
                <span className={s.inputWrap}>
                  <input className={s.input} type="number" inputMode="decimal" min={0} max={100} step={0.01} value={pct(draft[k])} onChange={(e) => setTerm(k, e.target.value)} />
                  <span className={s.unit} aria-hidden="true">{unit}</span>
                </span>
              </label>
            ))}
            <p className={s.editorNote} aria-live="polite">
              Label and artist share net profit: {formatPercent(draft.labelOfNetBp + draft.artistOfNetBp)} of 100% assigned.{' '}
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Done</Button>
            </p>
          </fieldset>
        ) : (
          <div><Button size="sm" onClick={() => setEditing(true)} disabled={sent} disabledReason="v5 is out for signatures. Make a new version to change it.">Edit draft shares</Button></div>
        )}

        <div className={s.cards}>
          <section className={s.card} aria-labelledby="deal">
            <Eyebrow as="h2" id="deal">Deal terms</Eyebrow>
            <dl className={s.terms}>{deal.dealTerms.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
          <MarketRangeWarning verified={{ date: deal.market.verified, href: '#market-source' }}>{deal.market.text}</MarketRangeWarning>
          <section className={s.card} aria-labelledby="history" style={{ gap: 6 }}>
            <Eyebrow as="h2" id="history">Version history</Eyebrow>
            <ul>
              <li className={s.version}><span className={s.vName}>v5</span><span className={s.vDate}>Draft · {deal.v5.created}</span>
                <span className={sent ? s.warn : valid ? s.good : s.bad}>{sent ? '○ Out for signatures' : valid ? '✓ Ready to send' : '! Not 100%'}</span></li>
              <li className={s.version}><span className={s.vName}>v4</span><span className={s.vDate}>{deal.v4.effective}</span><span className={s.good}>✓ In effect</span></li>
              {deal.history.map((h) => <li key={h.v} className={s.version}><span className={s.vName}>{h.v}</span><span className={s.vDate}>{h.date}</span><span className={s.muted}>Replaced</span></li>)}
            </ul>
          </section>
        </div>
        </ScreenState>
      </div>

      <dialog ref={preview} className={s.drawer} aria-labelledby="pv" onClick={(e) => { if (e.target === preview.current) preview.current?.close(); }}>
        <div className={s.drawerHead}><h2 id="pv" className={s.drawerTitle}>Preview a payout</h2><button type="button" className={s.iconBtn} aria-label="Close" onClick={() => preview.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <label className={s.field}>Recording income after fees and recoupment
          <span className={s.inputWrap}><span className={s.unit} aria-hidden="true">$</span><input className={s.input} type="number" min={0} step={0.01} value={income} onChange={(e) => setIncome(e.target.value)} /></span>
        </label>
        <table className={s.preview}>
          <caption className="visually-hidden">Who gets what from this income under v4 and draft v5</caption>
          <thead><tr><th scope="col">Party</th><th scope="col" className={s.r}>v4 (in effect)</th><th scope="col" className={s.r}>Draft v5</th></tr></thead>
          <tbody>
            {v4.map((p, i) => (
              <tr key={p.party}><th scope="row">{p.party}</th><td className={s.r}><Money cents={pctOf(gross, p.bp)} /></td><td className={s.r}><Money cents={pctOf(gross, v5[i].bp)} /></td></tr>
            ))}
            {!valid && <tr><th scope="row" className={s.bad}>Unassigned</th><td className={s.r}><Money cents={0} /></td><td className={`${s.r} ${s.bad}`}><Money cents={pctOf(gross, d5.gapOfTotalBp)} /></td></tr>}
          </tbody>
        </table>
        <p className={s.note}>Nothing is paid from a preview. Payouts under v5 wait until every party signs.</p>
      </dialog>
    </div>
  );
}
