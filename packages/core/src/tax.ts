// US tax rules for paying royalties, shared by the mock and the live server. Pure.
//
// Withholding, by the payee's form:
//   * W-9: nothing, unless the IRS has told the label to backup withhold (a B-notice): 24%.
//   * W-8BEN or W-8BEN-E: 30% (nonresident royalties), or the treaty rate when a treaty
//     country, article and rate are recorded.
//   * No form, or a W-8 past its expiry: the workspace decides. Hold the payout until a form
//     arrives (the default), or pay with 24% backup withholding.
// Year-end: US payees paid $10 or more in royalties get a 1099-MISC (box 2 royalties, box 4
// federal tax withheld). Foreign payees get a 1042-S (income code 12, royalties) whatever
// the amount.
import { formatMoney, type Cents } from './money';
import { pctOf } from './splits';
import { w8ExpiresOn } from './payouts';

export const BACKUP_RATE_BP = 2400;
export const NRA_RATE_BP = 3000;
/** Royalties are reportable on a 1099-MISC at $10 or more for the year. */
export const ROYALTY_1099_THRESHOLD: Cents = 1000;

export type MissingFormPolicy = 'hold' | 'withhold';
export type TaxForm = 'W-9' | 'W-8BEN' | 'W-8BEN-E';
export type TaxProfile = {
  form: string | null;
  /** W-8 only; a W-9 never expires. */
  expiresOn: string | null;
  backupWithholding?: boolean;
  treaty: { country: string; article: string; rateBp: number } | null;
};
export type Treatment =
  | { kind: 'none'; rateBp: 0; label: string }
  | { kind: 'backup' | 'nra' | 'treaty'; rateBp: number; label: string }
  | { kind: 'hold'; rateBp: null; label: string };

const isW8 = (form: string | null) => !!form && form.startsWith('W-8');
const pct = (bp: number) => `${bp / 100}%`;

/** A form that counts on `on`: a W-9, or a W-8 that hasn't expired. */
export function formValid(p: Pick<TaxProfile, 'form' | 'expiresOn'>, on: string): boolean {
  if (!p.form) return false;
  return !(isW8(p.form) && p.expiresOn && p.expiresOn < on);
}

/** How a payment to this payee is taxed on the day it is paid. */
export function taxTreatment(p: TaxProfile, on: string, policy: MissingFormPolicy): Treatment {
  if (!formValid(p, on)) {
    const why = p.form ? `${p.form} expired` : 'No tax form';
    return policy === 'hold'
      ? { kind: 'hold', rateBp: null, label: `${why}: payout held` }
      : { kind: 'backup', rateBp: BACKUP_RATE_BP, label: `${why}: ${pct(BACKUP_RATE_BP)} backup withholding` };
  }
  if (isW8(p.form)) {
    return p.treaty
      ? { kind: 'treaty', rateBp: p.treaty.rateBp, label: `${pct(p.treaty.rateBp)} under the ${p.treaty.country} treaty, ${/^article/i.test(p.treaty.article) ? p.treaty.article : `Article ${p.treaty.article}`}` }
      : { kind: 'nra', rateBp: NRA_RATE_BP, label: `${pct(NRA_RATE_BP)} withheld, no treaty recorded` };
  }
  return p.backupWithholding
    ? { kind: 'backup', rateBp: BACKUP_RATE_BP, label: `${pct(BACKUP_RATE_BP)} backup withholding (IRS notice)` }
    : { kind: 'none', rateBp: 0, label: 'No withholding' };
}

/** Tax withheld from a gross payment, in cents. Held payments withhold nothing (they aren't paid). */
export function withholding(gross: Cents, t: Treatment): Cents {
  return t.rateBp ? pctOf(gross, t.rateBp) : 0;
}

/** When a W-8 signed on `signed` stops counting. A W-9 doesn't expire. */
export const formExpiresOn = (form: TaxForm, signed: string): string | null => (form === 'W-9' ? null : w8ExpiresOn(signed));

// ---------- year-end ----------

export type PaidLine = {
  payeeId: string; name: string;
  form: string | null; country: string | null; treatyRateBp: number | null; tinLast4: string | null;
  /** Gross royalties paid and tax withheld from them, on a payment sent in the year. */
  grossCents: Cents; withheldCents: Cents;
};
export type Form1099 = { payeeId: string; name: string; tinLast4: string | null; royalties: Cents; withheld: Cents; reportable: boolean; note: string };
export type Form1042S = { payeeId: string; name: string; country: string | null; rateBp: number; gross: Cents; withheld: Cents };
export type YearEnd = {
  forms1099: Form1099[];
  forms1042s: Form1042S[];
  /** Paid in the year with no valid form on file: nothing can be filed for them until one arrives. */
  missing: { payeeId: string; name: string; paid: Cents }[];
};

/** Each payee's totals for a tax year, sorted by name, and which form each needs. */
export function yearEnd(lines: PaidLine[]): YearEnd {
  const by = new Map<string, PaidLine>();
  for (const l of lines) {
    const t = by.get(l.payeeId);
    by.set(l.payeeId, t ? { ...t, grossCents: t.grossCents + l.grossCents, withheldCents: t.withheldCents + l.withheldCents } : { ...l });
  }
  const all = [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  const forms1099: Form1099[] = all.filter((p) => p.form === 'W-9').map((p) => {
    const reportable = p.grossCents >= ROYALTY_1099_THRESHOLD || p.withheldCents > 0;
    return {
      payeeId: p.payeeId, name: p.name, tinLast4: p.tinLast4, royalties: p.grossCents, withheld: p.withheldCents, reportable,
      note: reportable ? (p.tinLast4 ? 'Ready' : 'Taxpayer number not confirmed') : `Under ${formatMoney(ROYALTY_1099_THRESHOLD)}: no form needed`,
    };
  });
  const forms1042s: Form1042S[] = all.filter((p) => isW8(p.form)).map((p) => ({
    payeeId: p.payeeId, name: p.name, country: p.country, rateBp: p.treatyRateBp ?? NRA_RATE_BP, gross: p.grossCents, withheld: p.withheldCents,
  }));
  const missing = all.filter((p) => !p.form).map((p) => ({ payeeId: p.payeeId, name: p.name, paid: p.grossCents }));
  return { forms1099, forms1042s, missing };
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const dollars = (c: Cents) => (c / 100).toFixed(2);

/**
 * The year's filing data as CSV, one row per form, for the label's filing service or the IRS
 * IRIS portal. The full taxpayer number isn't stored here, so it is left for the label to fill.
 */
export function yearEndCsv(year: number, payer: string, y: YearEnd): string {
  const rows: (string | number)[][] = [['Form', 'Tax year', 'Payer', 'Recipient', 'Taxpayer number', 'Country', 'Box', 'Royalties', 'Federal tax withheld', 'Rate']];
  for (const f of y.forms1099.filter((x) => x.reportable)) {
    rows.push(['1099-MISC', year, payer, f.name, f.tinLast4 ? `***-**-${f.tinLast4} (fill in full)` : 'Not on file', 'US', '2 Royalties', dollars(f.royalties), dollars(f.withheld), f.withheld ? pct(BACKUP_RATE_BP) : '0%']);
  }
  for (const f of y.forms1042s) {
    rows.push(['1042-S', year, payer, f.name, 'Not required', f.country ?? 'Not on file', 'Income code 12 Royalties', dollars(f.gross), dollars(f.withheld), pct(f.rateBp)]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
