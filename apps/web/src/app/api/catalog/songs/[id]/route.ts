import { NextResponse } from 'next/server';
import { UpdateSongCommand } from '@breakrecords/contract';
import { getCatalog } from '@/data/api';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** A song's writer roles and publishers, other titles and year written. Returns the catalog. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdateSongCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Check the details and try again.');
  const who = await teamWriter('catalog', 'the catalog');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await (await import('@/server/live/catalog')).liveUpdateSong(who.ctx, id, body.data);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const out = await (await import('@/server/mockPeople')).mockUpdateSong(id, body.data);
  return out.ok ? NextResponse.json(await getCatalog()) : err(out.status, out.error, out.message);
}
