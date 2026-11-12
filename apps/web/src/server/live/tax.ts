import 'server-only';
import type { Proposal, TaxYearResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { dayMonthYear } from '@breakrecords/core/payouts';
import { yearEnd, yearEndCsv, type PaidLine, type YearEnd } from '@breakrecords/core/tax';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveApprovals } from './approvals';

type TaxYear = TaxYearResponse;
export type TaxOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'already_prepared' | 'not_approved' | 'nothing_to_file'; message: string };

/** The approval card that files a year: one per year, prepared by the Royalties Agent. */
export const taxApprovalId = (year: number) => `tax_${year}`;

/** Payments sent in the year (paid lines), with each payee's current form. */
async function paidIn(tx: Tx, year: number): Promise<PaidLine[]> {
  const rows = await tx<{ slug: string; name: string; tax_form: string | null; tax_country: string | null; treaty_country: string | null; treaty_rate_bp: number | null;
    tin_last4: string | null; gross: string; withheld: string }[]>`
    SELECT p.slug, p.name, y.tax_form, y.tax_country, y.treaty_country, y.treaty_rate_bp, y.tin_last4,
           sum(l.amount_cents) AS gross, sum(l.withheld_cents) AS withheld
    FROM payout_lines l JOIN payout_batches b ON b.id = l.batch_id JOIN parties p ON p.id = l.party_id
    LEFT JOIN payees y ON y.party_id = l.party_id
    WHERE l.status = 'paid' AND b.status IN ('sent', 'failed') AND extract(year FROM b.sent_at) = ${year}
    GROUP BY p.slug, p.name, y.tax_form, y.tax_country, y.treaty_country, y.treaty_rate_bp, y.tin_last4`;
  return rows.map((r) => ({
    payeeId: r.slug, name: r.name, form: r.tax_form, country: r.treaty_country ?? r.tax_country, treatyRateBp: r.treaty_rate_bp, tinLast4: r.tin_last4,
    grossCents: Number(r.gross), withheldCents: Number(r.withheld),
  }));
}

/** Something to file: a reportable 1099-MISC or any 1042-S. */
export const hasForms = (y: YearEnd) => y.forms1099.some((f) => f.reportable) || y.forms1042s.length > 0;

async function taxYearIn(tx: Tx, ctx: RequestContext, year: number): Promise<TaxYear> {
  const y = yearEnd(await paidIn(tx, year));
  const years = await tx<{ y: number }[]>`SELECT DISTINCT extract(year FROM sent_at)::int AS y FROM payout_batches WHERE sent_at IS NOT NULL ORDER BY 1 DESC`;
  const [f] = await tx<{ approval_id: string; filed_at: Date | null; status: string | null }[]>`
    SELECT t.approval_id, t.filed_at, d.status::text AS status FROM tax_filings t
    LEFT JOIN approval_decisions d ON d.approval_id = t.approval_id WHERE t.year = ${year}`;
  const filing: TaxYear['filing'] = !f ? { status: 'none' }
    : f.filed_at ? { status: 'filed', approvalId: f.approval_id, filedOn: dayMonthYear(f.filed_at) }
    : { status: f.status === 'approved' ? 'approved' : f.status === 'rejected' ? 'rejected' : 'awaiting', approvalId: f.approval_id };
  return {
    year, years: [...new Set([new Date().getUTCFullYear(), ...years.map((r) => r.y)])].sort((a, b) => b - a), payer: ctx.tenantName,
    forms1099: y.forms1099, forms1042s: y.forms1042s.map((x) => ({ ...x, country: x.country && /^[A-Z]{2}$/.test(x.country) ? x.country : null })), missing: y.missing, filing,
  };
}

/** The year-end forms for the signed-in tenant. */
export function liveTaxYear(ctx: RequestContext, year: number): Promise<TaxYear> {
  return withTenant(sql, ctx, (tx) => taxYearIn(tx, ctx, year));
}

/** The facts the filing card's checks read (TAX-01). */
export async function taxFilingFacts(tx: Tx, year: number) {
  const y = yearEnd(await paidIn(tx, year));
  return {
    kind: 'tax_year' as const, year,
    missing: y.missing.map((m) => m.name),
    noTin: y.forms1099.filter((f) => f.reportable && !f.tinLast4).map((f) => f.name),
    forms: y.forms1099.filter((f) => f.reportable).length + y.forms1042s.length,
  };
}

/** The Royalties Agent prepares the year's filing as an approval card. Nothing is filed from here. */
export async function livePrepareTaxYear(ctx: RequestContext, year: number): Promise<TaxOutcome<TaxYear>> {
  const pre = await withTenant(sql, ctx, async (tx) => {
    const [f] = await tx<{ status: string | null }[]>`SELECT d.status::text AS status FROM tax_filings t LEFT JOIN approval_decisions d ON d.approval_id = t.approval_id WHERE t.year = ${year}`;
    return { y: yearEnd(await paidIn(tx, year)), prepared: !!f && f.status !== 'rejected' };
  });
  if (pre.prepared) return { ok: false, status: 409, error: 'already_prepared', message: `The ${year} filing is already prepared. It’s in Approvals.` };
  if (!hasForms(pre.y)) return { ok: false, status: 409, error: 'nothing_to_file', message: `No payee needs a ${year} tax form.` };
  const n1099 = pre.y.forms1099.filter((f) => f.reportable).length; const n1042 = pre.y.forms1042s.length;
  const total = pre.y.forms1099.filter((f) => f.reportable).reduce((a, f) => a + f.royalties, 0) + pre.y.forms1042s.reduce((a, f) => a + f.gross, 0);
  const proposal: Proposal = {
    id: taxApprovalId(year), type: 'filing', title: `File ${year} tax forms: ${[n1099 ? `${n1099} 1099-MISC` : '', n1042 ? `${n1042} 1042-S` : ''].filter(Boolean).join(', ')}`,
    agent: 'Royalties Agent', due: `Jan 31, ${year + 1}`, impact: `${formatMoney(total)} in royalties reported`, risk: 'needsEyes', riskLabel: 'Tax filing',
    context: 'Year-end tax forms', href: `/money/tax?year=${year}`, dept: 'Finance',
  };
  // Re-proposing a rejected card clears its decision, so it can be approved again.
  const out = await liveApprovals(ctx).propose(proposal);
  if (!out.ok) return { ok: false, status: 409, error: 'already_prepared', message: out.message };
  return withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO tax_filings (tenant_id, year, approval_id, prepared_by) VALUES (${ctx.tenantId}, ${year}, ${proposal.id}, ${ctx.userId}) ON CONFLICT DO NOTHING`;
    return { ok: true, value: await taxYearIn(tx, ctx, year) } as const;
  });
}

/** Marks the year filed once the label has uploaded the file. The database refuses it before approval. */
export function liveMarkTaxYearFiled(ctx: RequestContext, year: number): Promise<TaxOutcome<TaxYear>> {
  return withTenant(sql, ctx, async (tx) => {
    const [f] = await tx<{ approved: boolean; filed: boolean }[]>`
      SELECT coalesce(d.status = 'approved', false) AS approved, t.filed_at IS NOT NULL AS filed FROM tax_filings t
      LEFT JOIN approval_decisions d ON d.approval_id = t.approval_id WHERE t.year = ${year}`;
    if (!f) return { ok: false, status: 404, error: 'not_found', message: `The ${year} filing hasn’t been prepared.` } as const;
    if (!f.approved || f.filed) return { ok: false, status: 409, error: 'not_approved', message: f.filed ? `${year} is already marked filed.` : `Approve the ${year} filing first.` } as const;
    await tx`UPDATE tax_filings SET filed_at = clock_timestamp(), filed_by = ${ctx.userId} WHERE year = ${year}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-TAX-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'tax_filing.filed', ${String(year)}, ${tx.json({ year })})`;
    return { ok: true, value: await taxYearIn(tx, ctx, year) } as const;
  });
}

/** The year's CSV, only once its card is approved. */
export function liveTaxCsv(ctx: RequestContext, year: number): Promise<TaxOutcome<string>> {
  return withTenant(sql, ctx, async (tx) => {
    const t = await taxYearIn(tx, ctx, year);
    if (t.filing.status !== 'approved' && t.filing.status !== 'filed') return { ok: false, status: 409, error: 'not_approved', message: `Approve the ${year} filing before downloading it.` } as const;
    return { ok: true, value: yearEndCsv(year, ctx.tenantName, yearEnd(await paidIn(tx, year))) } as const;
  });
}
