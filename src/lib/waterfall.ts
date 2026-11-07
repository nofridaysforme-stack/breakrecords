// A statement waterfall: ordered steps from gross income to what one payee nets.
import type { Cents } from './money';

export type WaterfallStep =
  | { kind: 'start'; label: string; rule: string; amount: Cents; source?: string }
  | { kind: 'step'; label: string; rule: string; amount: Cents; source?: string }
  | { kind: 'subtotal'; label: string };

export type WaterfallRow = WaterfallStep & { balance: Cents };

/** Adds the running balance to each step. Subtotal rows repeat the balance at that point. */
export function runWaterfall(steps: WaterfallStep[]): WaterfallRow[] {
  let balance = 0;
  return steps.map((s) => {
    if (s.kind === 'start') balance = s.amount;
    else if (s.kind === 'step') balance += s.amount;
    return { ...s, balance };
  });
}

export function finalBalance(rows: WaterfallRow[]): Cents {
  return rows.length ? rows[rows.length - 1].balance : 0;
}
