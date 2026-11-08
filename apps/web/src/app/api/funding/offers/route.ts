import { NextResponse, type NextRequest } from 'next/server';
import { getOffers } from '@/data/api';
import { toCents } from '@breakrecords/core/money';
import { teamOnly } from '@/server/teamRoute';

/** GET /api/funding/offers?income=13200&growth=0 recomputes the comparison (dollars, growth in %). */
export async function GET(req: NextRequest) {
  const refused = await teamOnly('Funding offers');
  if (refused) return refused;
  const q = req.nextUrl.searchParams;
  const num = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const income = num('income'); const growth = num('growth'); const album = num('album');
  const offers = await getOffers({
    ...(income !== null && income >= 0 ? { annualIncome: toCents(income) } : {}),
    ...(growth !== null && growth > -100 ? { growthBp: Math.round(growth * 100) } : {}),
    ...(album !== null && album >= 0 ? { albumAnnualIncome: toCents(album) } : {}),
  });
  return offers ? NextResponse.json(offers) : NextResponse.json({ error: 'not_found', message: 'There aren’t two offers to compare.' }, { status: 404 });
}
