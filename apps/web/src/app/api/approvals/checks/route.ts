import { NextResponse } from 'next/server';
import { approvalsBackend, errorResponse, Forbidden, Unauthorized } from '@/server/approvals';

/** Every open card's checks, run now against today's data (the precondition engine). */
export async function GET() {
  try {
    return NextResponse.json(await (await approvalsBackend()).checks());
  } catch (e) {
    if (e instanceof Unauthorized) return errorResponse('unauthorized', 'Sign in to continue.');
    if (e instanceof Forbidden) return errorResponse('forbidden', 'Only the label’s owner and team can see approvals.');
    throw e;
  }
}
