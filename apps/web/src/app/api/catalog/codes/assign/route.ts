import { NextResponse } from 'next/server';
import { AssignCodeCommand } from '@breakrecords/contract';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Gives a recording the next ISRC, or a release the next UPC, from the workspace's prefix. Audited. */
export async function POST(req: Request) {
  const cmd = AssignCodeCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', 'Say which code (isrc or upc) and for which recording or release.');
  const w = await teamWriter('catalog', 'the catalog');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/codes')).liveAssignCode(w.ctx, cmd.data.kind, cmd.data.id)
    : await (await import('@/server/mockCodes')).mockAssignCode(cmd.data.kind, cmd.data.id);
  return r.ok ? NextResponse.json({ ...cmd.data, code: r.code }) : err(r.status, r.error, r.message);
}
