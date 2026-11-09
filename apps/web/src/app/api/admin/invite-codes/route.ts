import { NextResponse } from 'next/server';
import { CreateInviteCodeCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { payoutErr as err } from '@/server/teamRoute';

/** Indie SRVCS staff only. With sign-in off (sample data) there are no codes to manage. */
async function staff(): Promise<{ userId: string } | { refused: NextResponse }> {
  if (!authRequired()) return { refused: err(409, 'not_available', 'Invite codes work when sign-in is on.') };
  const ctx = await getContext();
  if (!ctx) return { refused: err(401, 'unauthorized', 'Sign in to continue.') };
  const { liveIsPlatformAdmin } = await import('@/server/live/inviteCodes');
  if (!(await liveIsPlatformAdmin(ctx.userId))) return { refused: err(403, 'forbidden', 'Only Indie SRVCS staff manage invite codes.') };
  return { userId: ctx.userId };
}

export async function GET() {
  const who = await staff();
  if ('refused' in who) return who.refused;
  return NextResponse.json(await (await import('@/server/live/inviteCodes')).liveInviteCodes(who.userId));
}

/** Makes a code. The code is in this response only; it's stored as a hash. */
export async function POST(req: Request) {
  const body = CreateInviteCodeCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Give the code a note, a number of uses (1 to 1000) and, optionally, days until it expires.');
  const who = await staff();
  if ('refused' in who) return who.refused;
  return NextResponse.json(await (await import('@/server/live/inviteCodes')).liveCreateInviteCode(who.userId, body.data));
}

/** Revokes a code (?id=). People who already signed up with it keep their accounts. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return err(400, 'invalid', 'Say which code to revoke.');
  const who = await staff();
  if ('refused' in who) return who.refused;
  return NextResponse.json(await (await import('@/server/live/inviteCodes')).liveRevokeInviteCode(who.userId, id));
}
