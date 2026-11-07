'use client';

import { Check, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { checkSplit } from '@/lib/splits';
import { formatPercent, percentToWords, type Bp } from '@/lib/percent';
import { Tooltip } from './Controls';
import { cx } from './cx';
import s from './Splits.module.css';

export type PartyColor = 1 | 2 | 3 | 4;
export type SplitParty = {
  party: string;
  /** Short name inside the bar: "Kesi". */
  short?: string;
  bp: Bp;
  rule?: string;
  /** Signature date ("Sep 28") or null when not signed yet. */
  signed?: string | null;
  color: PartyColor;
};

type Props = {
  title: string;
  parties: SplitParty[];
  /** Explanation under the bar, for example what changed in a draft. */
  note?: string;
  /** Show the party table (v4) or just a legend (draft v5). */
  table?: boolean;
  /** What the shares are of, for the message: "net profit". */
  of?: string;
  /** Header message when the split doesn't total 100%, if it is measured differently from the bar (4a: share of net profit). */
  gapMessage?: string;
  /** Status shown when the split is valid, instead of the signature summary. */
  okMessage?: string;
};

const MIN_LABEL_BP = 1000; // labels sit inside a segment only when it is at least 10% wide

/** Must visibly total 100%. Segments are focusable; arrow keys move between them. */
export function SplitBar({ title, parties, note, table = true, of = 'net profit', gapMessage, okMessage }: Props) {
  const check = checkSplit(parties.map((p) => ({ party: p.party, bp: p.bp })));
  const allSigned = parties.every((p) => p.signed);
  const gapBp = !check.ok && check.reason === 'under' ? check.gapBp : 0;
  const segs = [
    ...parties.map((p) => ({ key: p.party, bp: p.bp, cls: s[`p${p.color}`], inBar: `${p.short ?? p.party} ${formatPercent(p.bp)}`, p })),
    ...(gapBp ? [{ key: 'unassigned', bp: gapBp, cls: s.gap, inBar: '', p: null }] : []),
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? segs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + segs.length) % segs.length;
    setActive(j);
    refs.current[j]?.focus();
  };

  const message = check.ok
    ? null
    : gapMessage ?? (check.reason === 'under'
      ? `${formatPercent(check.gapBp)} of ${of} is unassigned`
      : `Shares add up to ${formatPercent(check.totalBp)}, ${formatPercent(check.gapBp)} too much`);

  return (
    <section className={cx(s.card, !check.ok && s.invalid)} aria-label={title}>
      <div className={s.head}>
        <h3 className={s.title}>{title}</h3>
        {check.ok ? (
          <span className={s.okMsg}><Check size={14} strokeWidth={3} aria-hidden="true" />{okMessage ?? (allSigned ? `Signed by all ${parties.length} · totals 100%` : 'Totals 100% · waiting on signatures')}</span>
        ) : (
          <span className={s.badMsg} role="status"><span className={s.badIcon} aria-hidden="true">!</span>{message}</span>
        )}
      </div>

      <div className={s.bar} role="group" aria-label={`${title}: shares. Use arrow keys to move between parties.`}>
        {segs.map((g, i) => {
          const shown = g.bp >= MIN_LABEL_BP && g.inBar ? `${g.inBar}: ` : '';
          const label = g.p
            ? `${shown}${g.p.party}, ${percentToWords(g.bp)}${g.p.rule ? `, ${g.p.rule}` : ''}, ${g.p.signed ? `signed ${g.p.signed}` : 'not signed yet'}`
            : `Unassigned, ${percentToWords(g.bp)}`;
          return (
            <Tooltip
              key={g.key}
              content={g.p ? (
                <span><span className={s.tipName}>{g.p.party}</span> · {formatPercent(g.bp, { fixed: true })}<br />{g.p.rule}{g.p.rule && <br />}{g.p.signed ? `Signed ${g.p.signed}` : 'Not signed yet'}</span>
              ) : <span>{formatPercent(g.bp)} unassigned. Give it to a party before sending.</span>}
            >
              <button
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                className={cx(s.seg, g.cls)}
                style={{ flex: g.bp }}
                tabIndex={i === active ? 0 : -1}
                onKeyDown={(e) => onKey(e, i)}
                onFocus={() => setActive(i)}
                aria-label={label}
              >
                <span aria-hidden="true">{g.bp >= MIN_LABEL_BP ? g.inBar : ''}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {table ? (
        <div className={s.parties} role="table" aria-label={`${title}: parties`}>
          <div role="row" style={{ display: 'contents' }}>
            <span role="columnheader" className={s.colHead}>Party</span>
            <span role="columnheader" className={cx(s.colHead, s.colRule)}>Rule</span>
            <span role="columnheader" className={s.colHead} style={{ textAlign: 'right' }}>Share</span>
            <span role="columnheader" className={cx(s.colHead, s.sigCol)}>Signature</span>
          </div>
          {parties.map((p) => (
            <div role="row" key={p.party} style={{ display: 'contents' }}>
              <span role="rowheader" className={s.party}><span className={cx(s.swatch, s[`p${p.color}`])} aria-hidden="true" />{p.party}</span>
              <span role="cell" className={s.rule}>{p.rule}</span>
              <span role="cell" className={s.share}>{formatPercent(p.bp, { fixed: true })}</span>
              <span role="cell" className={cx(p.signed ? s.signed : s.unsigned, s.sigCol)}>
                {p.signed ? <><Check size={13} strokeWidth={3} aria-hidden="true" />{p.signed}</> : <><Clock size={13} aria-hidden="true" />Not signed</>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <ul className={s.legend} aria-label="Legend">
          {parties.map((p) => (
            <li key={p.party} className={s.legendItem}><span className={cx(s.swatch, s[`p${p.color}`])} aria-hidden="true" />{p.short ?? p.party} {formatPercent(p.bp)}</li>
          ))}
          {gapBp > 0 && <li className={cx(s.legendItem, s.legendGap)}><span className={cx(s.swatch, s.gap)} aria-hidden="true" />{formatPercent(gapBp)} unassigned</li>}
        </ul>
      )}
      {note && <p className={s.note}>{note}</p>}
    </section>
  );
}

// ---------------- Split tree ----------------

export type SplitNode = {
  id: string;
  label: string;
  children?: SplitNode[];
  /** This node sets its own split instead of inheriting its parent's. */
  override?: boolean;
};

type TreeProps = {
  nodes: SplitNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Depth at which nodes start collapsed (release level is 2). */
  collapseBelow?: number;
};

/** Indent 14px per level. Collapsed by default below release level. */
export function SplitTree({ nodes, selectedId, onSelect, collapseBelow = 2 }: TreeProps) {
  const pathTo = (list: SplitNode[], id: string, trail: string[] = []): string[] | null => {
    for (const n of list) {
      if (n.id === id) return trail;
      const hit = n.children && pathTo(n.children, id, [...trail, n.id]);
      if (hit) return hit;
    }
    return null;
  };
  const [open, setOpen] = useState(() => {
    const ids = new Set<string>(pathTo(nodes, selectedId) ?? []);
    // 4a: the top level and the path to the selected node start open; everything else is collapsed.
    nodes.forEach((n) => { if (n.children?.length) ids.add(n.id); });
    return ids;
  });
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const render = (list: SplitNode[], depth: number): React.ReactNode =>
    list.map((n) => {
      const hasKids = Boolean(n.children?.length);
      const isOpen = open.has(n.id);
      return (
        <li key={n.id}>
          <button
            type="button"
            className={s.node}
            style={{ paddingLeft: 8 + depth * 14 }}
            aria-current={n.id === selectedId ? 'true' : undefined}
            aria-expanded={hasKids ? isOpen : undefined}
            onClick={() => { if (hasKids) toggle(n.id); onSelect(n.id); }}
          >
            <span className={s.caret} aria-hidden="true">{hasKids ? (isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : ''}</span>
            <span className={s.nodeLabel}>{n.label}</span>
            {depth > collapseBelow && (n.override ? <span className={s.override}>Override</span> : <span className={s.inherits}>inherits</span>)}
          </button>
          {hasKids && isOpen && <ul className={s.tree}>{render(n.children!, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <nav aria-label="Split tree">
      <h2 className={s.treeHead}>Split tree</h2>
      <ul className={s.tree}>{render(nodes, 0)}</ul>
      <p className={s.treeNote}>Below release level, nodes inherit their parent&apos;s split unless marked Override.</p>
    </nav>
  );
}
