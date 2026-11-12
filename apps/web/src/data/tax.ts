// Year-end tax forms in sample-data mode: the payments the sample label sent in 2026 (the
// July, August and September batches; Theo's August payment failed). Same numbers as the seed.
import { yearEnd, type PaidLine } from '@breakrecords/core/tax';

const w9 = (payeeId: string, name: string, tinLast4: string, dollars: number[]): PaidLine[] =>
  dollars.map((d) => ({ payeeId, name, form: 'W-9', country: 'US', treatyRateBp: null, tinLast4, grossCents: Math.round(d * 100), withheldCents: 0 }));

export const PAID_2026: PaidLine[] = [
  ...w9('marco-dela', 'Marco Dela', '1000', [258.7, 290, 312.6]),
  ...w9('ari-monroe', 'Ari Monroe', '2373', [240, 250, 280.12]),
  ...w9('dana-okafor', 'Dana Okafor', '1611', [162, 131.34, 141.9]),
  ...w9('rue-sato', 'Rue Sato', '5119', [162, 131.34, 141.91]),
  { payeeId: 'theo-lind', name: 'Theo Lind', form: 'W-8BEN', country: 'GB', treatyRateBp: 0, tinLast4: null, grossCents: 14191, withheldCents: 0 },
];
export const TAX_YEARS = [2026];

/** The facts a year's filing card is checked against (TAX-01, TAX-02). */
export function mockTaxFacts(year: number) {
  const y = yearEnd(year === 2026 ? PAID_2026 : []);
  return { kind: 'tax_year' as const, year, missing: y.missing.map((m) => m.name), noTin: y.forms1099.filter((f) => f.reportable && !f.tinLast4).map((f) => f.name),
    forms: y.forms1099.filter((f) => f.reportable).length + y.forms1042s.length };
}
