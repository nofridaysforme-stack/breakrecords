import { NextResponse } from 'next/server';
import { AddRecoupableCostCommand } from '@breakrecords/contract';
import { getRecoupment } from '@/data/api';
import { mockAddCost } from '@/server/mockPayouts';
import { liveAddCost } from '@/server/live/payouts';
import { payoutErr, payoutWriter } from '@/server/payoutsRoute';

/** Add a recoupable cost to a release. Audited. Returns every release's recoupment. */
export async function POST(req: Request) {
  const body = AddRecoupableCostCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', body.error.issues[0]?.message ?? 'Send a release, a category, a cost in cents and a share in basis points.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await liveAddCost(who.ctx, body.data);
    return out.ok ? NextResponse.json({ items: out.value }) : payoutErr(out.status, out.error, out.message);
  }
  if (!(await mockAddCost(body.data))) return payoutErr(404, 'not_found', 'That release has no recoupment account.');
  return NextResponse.json({ items: await getRecoupment() });
}
