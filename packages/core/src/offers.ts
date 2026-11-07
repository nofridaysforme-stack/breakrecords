// Offer comparison (5e, 5j). Every derived number comes from the assumptions, so changing
// income or growth recomputes the whole table (flows.md > Offer comparison). Integer cents.
import type { Cents } from './money';

export type OfferAssumptions = {
  /** Last 12 months of streaming income. */
  annualIncome: Cents;
  /** Yearly growth in basis points (0 = held flat). */
  growthBp: number;
  /** Yearly income of the album a sale would take a share of. */
  albumAnnualIncome: Cents;
  /** Years the comparison runs over. */
  years: number;
};

export type AdvanceOffer = { kind: 'advance'; cash: Cents; repayTotal: Cents; shareBp: number };
export type SaleOffer = { kind: 'sale'; cash: Cents; shareBp: number; album: string };

export type AdvanceResult = {
  cash: Cents; cost: Cents; months: number; yearlyCostBp: number; income: Cents;
};
export type SaleResult = {
  cash: Cents; cost: Cents; yearlyCostBp: number; income: Cents;
};

/** Income in each month, growing once a year. */
function monthly(a: OfferAssumptions, monthIndex: number, base: Cents) {
  const year = Math.floor(monthIndex / 12);
  return Math.round((base * (1 + a.growthBp / 10000) ** year) / 12);
}

export function baselineIncome(a: OfferAssumptions): Cents {
  let total = 0;
  for (let m = 0; m < a.years * 12; m++) total += monthly(a, m, a.annualIncome);
  return total;
}

/** The advance is repaid from a share of each month's streaming income until the total is met. */
export function advance(a: OfferAssumptions, o: AdvanceOffer): AdvanceResult {
  let owed = o.repayTotal;
  let months = 0;
  for (let m = 0; m < a.years * 12 && owed > 0; m++) {
    owed -= Math.min(owed, Math.round((monthly(a, m, a.annualIncome) * o.shareBp) / 10000));
    months = m + 1;
  }
  const cost = o.repayTotal - o.cash;
  // Simple yearly rate: fee over cash, spread over the whole months it runs.
  const yearlyCostBp = Math.round((cost / o.cash) * 10000 / (months / 12));
  return { cash: o.cash, cost, months, yearlyCostBp, income: baselineIncome(a) - cost };
}

/** A sale gives up a share of one album's income for good, so its cost keeps growing after the window. */
export function sale(a: OfferAssumptions, o: SaleOffer): SaleResult {
  let cost = 0;
  for (let m = 0; m < a.years * 12; m++) cost += Math.round((monthly(a, m, a.albumAnnualIncome) * o.shareBp) / 10000);
  const firstYear = Math.round((a.albumAnnualIncome * o.shareBp) / 10000);
  return { cash: o.cash, cost, yearlyCostBp: Math.round((firstYear / o.cash) * 10000), income: baselineIncome(a) - cost };
}
