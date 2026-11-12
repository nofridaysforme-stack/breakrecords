import { NextResponse } from 'next/server';
import { mockMarkFiled } from '@/server/mockTax';
import { liveMarkTaxYearFiled } from '@/server/live/tax';
import { payoutErr, payoutWriter } from '@/server/teamRoute';
import { yearOf } from '@/server/taxYear';

/** The label uploaded the approved file to the IRS: the year is marked filed and its approval can't be undone. */
export async function POST(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = yearOf((await params).year);
  if (!year) return payoutErr(400, 'invalid', 'Send a four-digit year.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const out = who.ctx ? await liveMarkTaxYearFiled(who.ctx, year) : await mockMarkFiled(year);
  return out.ok ? NextResponse.json(out.value) : payoutErr(out.status, out.error, out.message);
}
