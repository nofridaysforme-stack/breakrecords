import { NextResponse } from 'next/server';
import { ReviewStarterCommand } from '@breakrecords/contract';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Indie SRVCS staff record (or withdraw) that an attorney reviewed a starter template's wording. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = ReviewStarterCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Say whether it was reviewed.');
  const who = await teamWriter('contracts', 'contracts');
  if ('refused' in who) return who.refused;
  if (!who.ctx) return err(403, 'forbidden', 'Only Indie SRVCS staff record a lawyer’s review.');
  const out = await (await import('@/server/live/contracts')).liveReviewStarter(who.ctx, (await params).id, body.data.reviewed);
  return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
}
