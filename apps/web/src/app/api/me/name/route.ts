import { NextResponse } from 'next/server';
import { SetMyNameCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { payoutErr as err } from '@/server/teamRoute';

/** The name you go by in this app: shown in the activity log and the team list instead of your email. */
export async function PUT(req: Request) {
  const body = SetMyNameCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'A name up to 80 characters.');
  if (!authRequired()) return err(409, 'sample', 'Sample data has no account to name. Sign in to set your name.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  await (await import('@/server/live/settings')).liveSetMyName(ctx, body.data.name || null);
  return NextResponse.json({ name: body.data.name || null });
}
