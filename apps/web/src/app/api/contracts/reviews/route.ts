import { NextResponse } from 'next/server';
import { RequestContractReviewCommand } from '@breakrecords/contract';
import { getContracts } from '@/data/api';
import { mockRequestReview } from '@/server/mockContracts';
import { liveRequestReview } from '@/server/live/contracts';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { payoutErr as err } from '@/server/teamRoute';

/** Send an uploaded contract to Legal Agent for review. Audited. It never signs or replies to anyone. */
export async function POST(req: Request) {
  const body = RequestContractReviewCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Send the file name of a PDF or Word file.');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return err(403, 'forbidden', 'Only the label’s owner and team manage contracts.');
    if (isLive('contracts')) return NextResponse.json(await liveRequestReview(ctx, body.data.fileName));
  }
  await mockRequestReview(body.data.fileName);
  return NextResponse.json(await getContracts());
}
