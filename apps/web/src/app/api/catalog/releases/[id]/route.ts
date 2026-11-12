import { NextResponse } from 'next/server';
import { EditReleaseCommand, UpdateReleaseCommand } from '@breakrecords/contract';
import { getCatalog } from '@/data/api';
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

/** Change a release: title, kind, date and its tracks in order. Owners and team only. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cmd = EditReleaseCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Check the release.');
  const w = await teamWriter('catalog', 'the catalog');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/catalog')).liveEditRelease(w.ctx, id, cmd.data)
    : await (await import('@/server/mockMusic')).mockEditRelease(id, cmd.data);
  if (!r.ok) return err(r.status, r.error, r.message);
  return NextResponse.json(w.ctx ? r.value : await getCatalog());
}

/** Remove a release that hasn't been used for money (no split sent, statements, payouts or income). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = await teamWriter('catalog', 'the catalog');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/catalog')).liveRemoveRelease(w.ctx, id)
    : await (await import('@/server/mockMusic')).mockRemoveRelease(id);
  if (!r.ok) return err(r.status, r.error, r.message);
  return NextResponse.json(w.ctx ? r.value : await getCatalog());
}
