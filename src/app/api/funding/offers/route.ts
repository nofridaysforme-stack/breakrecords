import { NextResponse, type NextRequest } from 'next/server';
import { getOffers } from '@/data/api';
import { offerAssumptions } from '@/data/ops';
import { toCents } from '@/lib/money';

/** GET /api/funding/offers?income=13200&growth=0 recomputes the comparison (dollars, growth in %). */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const num = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const income = num('income'); const growth = num('growth'); const album = num('album');
  return NextResponse.json(getOffers({
    ...offerAssumptions,
    ...(income !== null && income >= 0 ? { annualIncome: toCents(income) } : {}),
    ...(growth !== null ? { growthBp: Math.round(growth * 100) } : {}),
    ...(album !== null && album >= 0 ? { albumAnnualIncome: toCents(album) } : {}),
  }));
}
