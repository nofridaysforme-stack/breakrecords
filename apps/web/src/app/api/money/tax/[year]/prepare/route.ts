import { NextResponse } from 'next/server';
import { mockPrepareTaxYear } from '@/server/mockTax';
import { livePrepareTaxYear } from '@/server/live/tax';
import { payoutErr, payoutWriter } from '@/server/teamRoute';
import { yearOf } from '@/server/taxYear';

/** The Royalties Agent prepares the year's filing as an approval card. Nothing is filed from here. */
export async function POST(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = yearOf((await params).year);
  if (!year) return payoutErr(400, 'invalid', 'Send a four-digit year.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const out = who.ctx ? await livePrepareTaxYear(who.ctx, year) : await mockPrepareTaxYear(year);
  return out.ok ? NextResponse.json(out.value) : payoutErr(out.status, out.error, out.message);
}
