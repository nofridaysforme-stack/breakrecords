import { NextResponse } from 'next/server';
import { CreateBriefCommand } from '@breakrecords/contract';
import { getSync, syncErr, syncReader } from '@/server/syncRoute';

/** A request from a music supervisor or brand. */
export async function POST(req: Request) {
  const cmd = CreateBriefCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return syncErr(400, 'invalid', cmd.error.issues[0]?.message ?? 'Check the brief.');
  const who = await syncReader();
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await (await import('@/server/live/sync')).liveCreateBrief(who.ctx, cmd.data);
    return out.ok ? NextResponse.json(out.value) : syncErr(out.status, out.error, out.message);
  }
  await (await import('@/server/mockSync')).mockCreateBrief(cmd.data);
  return NextResponse.json(await getSync(null));
}
