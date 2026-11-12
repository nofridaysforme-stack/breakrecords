import { NextResponse } from 'next/server';
import { ResolveFlagCommand } from '@breakrecords/contract';
import { getReserves } from '@/data/api';
import { approvalsBackend } from '@/server/approvals';
import { mockResolveFlag } from '@/server/mockReserves';
import { liveResolveFlag } from '@/server/live/reserves';
import { payoutErr, payoutWriter } from '@/server/teamRoute';

/**
 * Resolves a flag. Artificial streams: the held income is forfeited. Real listeners: an approval
 * card asks to release the money, which stays held until it is approved. A reason is required.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = ResolveFlagCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', 'Choose real listeners or artificial streams, and say why.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const { id } = await params;
  const out = who.ctx
    ? await liveResolveFlag(who.ctx, id, body.data.outcome, body.data.note)
    : await mockResolveFlag(id, body.data.outcome, body.data.note, async (p) => (await approvalsBackend()).propose(p));
  if (!out.ok) return payoutErr(out.status, out.error, out.message);
  return NextResponse.json('value' in out ? out.value : await getReserves());
}
