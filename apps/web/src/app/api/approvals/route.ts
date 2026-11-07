import { NextResponse, type NextRequest } from 'next/server';
import { ProposeCommand } from '@breakrecords/contract';
import { getApprovals } from '@/data/api';
import { toScenario } from '@/data/types';
import { errorResponse, handle } from '@/server/approvals';

export function GET(req: NextRequest) {
  return NextResponse.json(getApprovals(toScenario(req.nextUrl.searchParams.get('state'))));
}

/** Create or replace an in-app approval (a plan, offer acceptance, drafted contract or claim). */
export async function POST(req: Request) {
  const cmd = ProposeCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return errorResponse('invalid', cmd.error.issues[0]?.message ?? 'Invalid proposal');
  return handle((b) => b.propose(cmd.data.proposal));
}
