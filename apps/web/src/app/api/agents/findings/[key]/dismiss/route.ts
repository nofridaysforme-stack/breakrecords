import { NextResponse } from 'next/server';
import { DismissFindingCommand } from '@breakrecords/contract';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Dismisses an open finding with a reason; the agents won't raise it again. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const body = DismissFindingCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Say why, in a few words.');
  const who = await teamWriter('activity', 'the agents');
  if ('refused' in who) return who.refused;
  if (!who.ctx) return err(409, 'not_live', 'Agents run on your live workspace only.');
  const out = await (await import('@/server/agents/run')).liveDismissFinding(who.ctx, decodeURIComponent((await params).key), body.data.note);
  return out ? NextResponse.json(out) : err(404, 'not_found', 'That finding isn’t open.');
}
