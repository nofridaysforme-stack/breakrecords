import { NextResponse } from 'next/server';
import { getTaxYear } from '@/data/api';
import { payoutErr, teamOnly } from '@/server/teamRoute';
import { yearOf } from '@/server/taxYear';


/** The year-end forms: a 1099-MISC for each US payee paid $10 or more, a 1042-S for each foreign payee. */
export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = yearOf((await params).year);
  if (!year) return payoutErr(400, 'invalid', 'Send a four-digit year.');
  return (await teamOnly('Tax forms')) ?? NextResponse.json(await getTaxYear(year));
}
