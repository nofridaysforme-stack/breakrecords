import { NextResponse } from 'next/server';
import { UpdateReleaseCommand } from '@breakrecords/contract';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Set or clear a release's UPC (checked, including its check digit). Owners and team only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cmd = UpdateReleaseCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', 'Send { "upc": "…" }, or null to remove it.');
  const w = await teamWriter('catalog', 'the catalog');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/codes')).liveSetUpc(w.ctx, id, cmd.data.upc)
    : await (await import('@/server/mockCodes')).mockSetUpc(id, cmd.data.upc);
  return r.ok ? NextResponse.json({ id, upc: r.upc }) : err(r.status, r.error, r.message);
}
