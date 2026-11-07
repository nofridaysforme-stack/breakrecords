import { NextResponse, type NextRequest } from 'next/server';
import { getHome } from '@/data/api';
import { toScenario } from '@/data/types';

export async function GET(req: NextRequest) {
  return NextResponse.json(await getHome(toScenario(req.nextUrl.searchParams.get('state'))));
}
