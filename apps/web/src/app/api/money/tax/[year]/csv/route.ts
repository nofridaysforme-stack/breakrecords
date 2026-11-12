import { mockTaxCsv } from '@/server/mockTax';
import { liveTaxCsv } from '@/server/live/tax';
import { payoutErr, payoutWriter } from '@/server/teamRoute';
import { yearOf } from '@/server/taxYear';

/** The year's forms as CSV, for the label's filing service or the IRS. Only once the filing is approved. */
export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = yearOf((await params).year);
  if (!year) return payoutErr(400, 'invalid', 'Send a four-digit year.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const out = who.ctx ? await liveTaxCsv(who.ctx, year) : await mockTaxCsv(year);
  if (!out.ok) return payoutErr(out.status, out.error, out.message);
  return new Response(out.value, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="tax-forms-${year}.csv"` } });
}
