import { NextResponse, type NextRequest } from 'next/server';
import { getApprovals } from '@/data/api';
import { toScenario } from '@/data/types';

export function GET(req: NextRequest) {
  return NextResponse.json(getApprovals(toScenario(req.nextUrl.searchParams.get('state'))));
}
