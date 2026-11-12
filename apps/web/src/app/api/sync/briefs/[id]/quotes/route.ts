import { NextResponse } from 'next/server';
import { CreateQuoteCommand } from '@breakrecords/contract';
import { getSync, syncErr, syncReader } from '@/server/syncRoute';

/** Offer a recording for a brief: one fee for master and song, and the use. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cmd = CreateQuoteCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return syncErr(400, 'invalid', cmd.error.issues[0]?.message ?? 'Check the quote.');
  const who = await syncReader();
  if ('refused' in who) return who.refused;
  const { id } = await params;
  const out = who.ctx ? await (await import('@/server/live/sync')).liveCreateQuote(who.ctx, id, cmd.data) : await (await import('@/server/mockSync')).mockCreateQuote(id, cmd.data);
  if (!out.ok) return syncErr(out.status, out.error, out.message);
  return NextResponse.json('value' in out ? out.value : await getSync(null));
}
