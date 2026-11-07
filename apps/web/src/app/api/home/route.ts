import { NextResponse, type NextRequest } from 'next/server';
import { getHome } from '@/data/api';
import { toScenario } from '@/data/types';

export function GET(req: NextRequest) {
  return NextResponse.json(getHome(toScenario(req.nextUrl.searchParams.get('state'))));
}
