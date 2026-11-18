import { NextResponse } from 'next/server';
import { RegistrationActionCommand } from '@breakrecords/contract';
import { approvalsBackend } from '@/server/approvals';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';
import { getRegistrations } from '@/data/api';

export async function GET() { return NextResponse.json(await getRegistrations()); }

/**
 * Moves one registration along: prepare a filing (an approval card), record it submitted after
 * approval (ends the card's undo), or record the confirmation and its number.
 */
export async function POST(req: Request) {
  const body = RegistrationActionCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Say which registration and what happened.');
  const who = await teamWriter('registrations', 'registrations');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await (await import('@/server/live/rights')).liveRegistrationAction(who.ctx, body.data);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const m = await import('@/server/mockRegistrations');
  const out = await m.mockRegistrationAction(body.data, async (p) => (await approvalsBackend()).propose(p));
  return out.ok ? NextResponse.json(await m.mockRegistrations()) : err(out.status, out.error, out.message);
}
