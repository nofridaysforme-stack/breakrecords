import 'server-only';
import { cookies } from 'next/headers';
import type { Proposal, SubmitTaxFormCommand, TaxYearResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { formExpiresOn, taxTreatment, yearEnd, yearEndCsv, type MissingFormPolicy } from '@breakrecords/core/tax';
import { dayMonthYear } from '@breakrecords/core/payouts';
import { TODAY } from '@/data/fixtures';
import { payees, payouts, type Payee } from '@/data/money';
import { PAID_2026, TAX_YEARS } from '@/data/tax';
import { approvalsBackend } from './approvals';
import { mockSession } from './session';

// Sample-data mode: the missing-form choice, forms payees submit, and filings, per browser session.
type State = { policy: MissingFormPolicy; forms: Record<string, SubmitTaxFormCommand & { signedOn: string }>; prepared: number[]; filed: Record<number, string> };
const g = globalThis as unknown as { __brTax?: Map<string, State> };
const store = (g.__brTax ??= new Map());
const empty = (): State => ({ policy: 'hold', forms: {}, prepared: [], filed: {} });

async function read(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || empty();
}
async function write(change: (s: State) => void): Promise<void> {
  const id = await mockSession();
  const s = store.get(id) ?? empty();
  change(s);
  store.set(id, s);
}

const PAYER = 'Northline Records';
export const mockTaxApprovalId = (year: number) => `tax_${year}`;
export type TaxOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'already_prepared' | 'not_approved' | 'nothing_to_file'; message: string };

export async function mockPolicy(): Promise<MissingFormPolicy> { return (await read()).policy; }

/** 4d's tax forms with the session's policy applied. */
export async function mockPayoutsTax(base: typeof payouts): Promise<typeof payouts> {
  const policy = (await read()).policy;
  const missing = taxTreatment({ form: null, expiresOn: null, treaty: null }, TODAY.iso, policy).label;
  return { ...base, missingFormPolicy: policy, taxForms: base.taxForms.map((t) => (t.status === 'missing' ? { ...t, withholding: missing } : t)) };
}
export async function mockSetPolicy(policy: MissingFormPolicy): Promise<void> { await write((s) => { s.policy = policy; }); }

const lines = (year: number) => (year === 2026 ? PAID_2026 : []);

export async function mockTaxYear(year: number): Promise<TaxYearResponse> {
  const s = await read();
  const y = yearEnd(lines(year));
  const id = mockTaxApprovalId(year);
  const decision = s.prepared.includes(year) ? (await (await approvalsBackend()).state()).decisions[id]?.status : undefined;
  const filing: TaxYearResponse['filing'] = !s.prepared.includes(year) ? { status: 'none' }
    : s.filed[year] ? { status: 'filed', approvalId: id, filedOn: dayMonthYear(s.filed[year]) }
    : { status: decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'awaiting', approvalId: id };
  return { year, years: TAX_YEARS, payer: PAYER, forms1099: y.forms1099, forms1042s: y.forms1042s, missing: y.missing, filing };
}

export async function mockPrepareTaxYear(year: number): Promise<TaxOutcome<TaxYearResponse>> {
  const now = await mockTaxYear(year);
  if (now.filing.status !== 'none' && now.filing.status !== 'rejected') return { ok: false, status: 409, error: 'already_prepared', message: `The ${year} filing is already prepared. It’s in Approvals.` };
  const y = yearEnd(lines(year));
  const n1099 = y.forms1099.filter((f) => f.reportable).length; const n1042 = y.forms1042s.length;
  if (!n1099 && !n1042) return { ok: false, status: 409, error: 'nothing_to_file', message: `No payee needs a ${year} tax form.` };
  const total = y.forms1099.filter((f) => f.reportable).reduce((a, f) => a + f.royalties, 0) + y.forms1042s.reduce((a, f) => a + f.gross, 0);
  const proposal: Proposal = {
    id: mockTaxApprovalId(year), type: 'filing', title: `File ${year} tax forms: ${[n1099 ? `${n1099} 1099-MISC` : '', n1042 ? `${n1042} 1042-S` : ''].filter(Boolean).join(', ')}`,
    agent: 'Royalties Agent', due: `Jan 31, ${year + 1}`, impact: `${formatMoney(total)} in royalties reported`, risk: 'needsEyes', riskLabel: 'Tax filing',
    context: 'Year-end tax forms', href: `/money/tax?year=${year}`, dept: 'Finance',
  };
  await (await approvalsBackend()).propose(proposal);
  await write((s) => { if (!s.prepared.includes(year)) s.prepared.push(year); });
  return { ok: true, value: await mockTaxYear(year) };
}

export async function mockMarkFiled(year: number): Promise<TaxOutcome<TaxYearResponse>> {
  const t = await mockTaxYear(year);
  if (t.filing.status === 'none') return { ok: false, status: 404, error: 'not_found', message: `The ${year} filing hasn’t been prepared.` };
  if (t.filing.status !== 'approved') return { ok: false, status: 409, error: 'not_approved', message: t.filing.status === 'filed' ? `${year} is already marked filed.` : `Approve the ${year} filing first.` };
  await write((s) => { s.filed[year] = TODAY.iso; });
  return { ok: true, value: await mockTaxYear(year) };
}

export async function mockTaxCsv(year: number): Promise<TaxOutcome<string>> {
  const t = await mockTaxYear(year);
  if (t.filing.status !== 'approved' && t.filing.status !== 'filed') return { ok: false, status: 409, error: 'not_approved', message: `Approve the ${year} filing before downloading it.` };
  return { ok: true, value: yearEndCsv(year, PAYER, yearEnd(lines(year))) };
}

/** A sample payee with the form they submitted this session, if any. */
export async function mockPayeeTax(p: Payee): Promise<Payee> {
  const s = await read();
  const f = s.forms[p.id];
  if (!f) return p;
  const expires = formExpiresOn(f.form, f.signedOn);
  const t = taxTreatment({ form: f.form, expiresOn: expires, treaty: f.treaty && f.country ? { country: f.country, article: f.treaty.article, rateBp: f.treaty.rateBp } : null }, TODAY.iso, s.policy);
  return { ...p, tax: { ok: true, label: `${f.form} on file`, form: f.form, expires: expires ? `Expires ${dayMonthYear(expires)}` : 'No expiry', withholding: t.label, canSubmit: true } };
}
export async function mockSubmitTaxForm(payeeId: string, c: SubmitTaxFormCommand): Promise<Payee | null> {
  const p = payees[payeeId];
  if (!p) return null;
  await write((s) => { s.forms[payeeId] = { ...c, signedOn: TODAY.iso }; });
  return mockPayeeTax(p);
}
