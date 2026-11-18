import { NextResponse } from 'next/server';
import { UnclaimedActionCommand } from '@breakrecords/contract';
import { getUnclaimed } from '@/data/api';
import { approvalsBackend } from '@/server/approvals';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

export async function GET() { return NextResponse.json(await getUnclaimed()); }

/** Moves a claim along: prepare (an approval card), submitted after approval, then paid or not ours. */
export async function POST(req: Request) {
  const body = UnclaimedActionCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Say which claim and what happened.');
  const who = await teamWriter('registrations', 'unclaimed money');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await (await import('@/server/live/rights')).liveClaimAction(who.ctx, body.data);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const m = await import('@/server/mockUnclaimed');
  const out = await m.mockClaimAction(body.data, async (p) => (await approvalsBackend()).propose(p));
  return out.ok ? NextResponse.json(await m.mockUnclaimed()) : err(out.status, out.error, out.message);
}
