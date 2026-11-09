import { NextResponse, type NextRequest } from 'next/server';
import { getSearch } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

/** ⌘K results for the signed-in tenant. */
export async function GET(req: NextRequest) {
  const refused = await teamOnly('Search');
  if (refused) return refused;
  return NextResponse.json(await getSearch((req.nextUrl.searchParams.get('q') ?? '').slice(0, 200)));
}
