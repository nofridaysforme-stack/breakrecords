'use client';

import { useId } from 'react';
import { Popover } from 'radix-ui';
import { X } from 'lucide-react';
import { formatMoney, moneyToWords, type Cents, type Currency } from '@breakrecords/core/money';
import type { WaterfallRow } from '@breakrecords/core/waterfall';
import { cx } from './cx';
import s from './Money.module.css';

type MoneyProps = {
  cents: Cents;
  currency?: Currency;
  wholeIfRound?: boolean;
  className?: string;
  /** When given, the amount opens its waterfall. */
  waterfall?: { title: string; rows: WaterfallRow[]; totalLabel: string };
};

/** Mono, tabular, read aloud in full words. Expands to its waterfall when one is given. */
export function Money({ cents, currency = 'USD', wholeIfRound, className, waterfall }: MoneyProps) {
  const text = formatMoney(cents, { currency, wholeIfRound });
  const words = moneyToWords(cents, currency);
  const descId = useId();
  if (!waterfall) {
    // Screen readers get the full words; sighted users get the figure.
    return (
      <span className={cx(s.money, className)}>
        <span aria-hidden="true">{text}</span>
        <span className="visually-hidden">{words}</span>
      </span>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger className={cx(s.trigger, className)} aria-describedby={descId}>
        {text}
      </Popover.Trigger>
      <span id={descId} hidden>{words}. Opens how it was calculated.</span>
      <Popover.Portal>
        <Popover.Content className={s.popover} sideOffset={8} align="start" aria-label={waterfall.title}>
          <div className={s.popHead}>
            <span>{waterfall.title}</span>
            <Popover.Close aria-label="Close" style={{ background: 'none', border: 0, color: 'inherit', minWidth: 32, minHeight: 32 }}>
              <X size={16} aria-hidden="true" />
            </Popover.Close>
          </div>
          <Waterfall rows={waterfall.rows} totalLabel={waterfall.totalLabel} compact />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type WaterfallProps = {
  rows: WaterfallRow[];
  /** Final brand row label: "Kesi Vale nets". */
  totalLabel: string;
  compact?: boolean;
  /** Where each source id links; defaults to the statement row anchor. */
  sourceHref?: (source: string) => string;
  caption?: string;
};

/** Waterfall (4c): step, rule, amount, running balance, source. Subtotals raised, total on brand. */
export function Waterfall({ rows, totalLabel, compact, sourceHref = (id) => `#source-${id}`, caption }: WaterfallProps) {
  const total = rows.length ? rows[rows.length - 1].balance : 0;
  return (
    <div className={compact ? undefined : s.wrap} role={compact ? undefined : 'region'} aria-label={compact ? undefined : caption ?? totalLabel} tabIndex={compact ? undefined : 0}>
      <table className={cx(s.wf, compact && s.compact)}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Rule</th>
            <th scope="col" className={s.r}>Amount</th>
            <th scope="col" className={s.r}>Running balance</th>
            <th scope="col" className={s.r}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cx(r.kind === 'subtotal' && s.sub, r.kind === 'start' && s.start)}>
              <th scope="row" className={s.step}>{r.label}</th>
              <td className={s.rule}>{r.kind === 'subtotal' ? '' : r.rule}</td>
              <td className={cx(s.amt, r.kind === 'step' && r.amount < 0 && s.neg)}>
                {r.kind === 'subtotal' ? '' : <Money cents={r.amount} />}
              </td>
              <td className={s.bal}><Money cents={r.balance} /></td>
              <td className={s.src}>{r.kind !== 'subtotal' && r.source ? <a href={sourceHref(r.source)}>{r.source}</a> : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={s.total}>
            <th scope="row" colSpan={3} className={s.totalLabel}>{totalLabel}</th>
            <td colSpan={2} className={s.totalAmt}><Money cents={total} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
