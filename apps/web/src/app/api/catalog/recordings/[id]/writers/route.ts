import { NextResponse } from 'next/server';
import { SetWritersCommand } from '@breakrecords/contract';
import { mockSetWriters } from '@/server/mockMusic';
import { liveSetWriters } from '@/server/live/splits';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Who wrote the song on this recording, and their shares (total 100%). Every writer confirms again. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cmd = SetWritersCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Check the writers.');
  const w = await teamWriter('catalog', 'songwriters');
  if ('refused' in w) return w.refused;
  const { id } = await params;
  const out = w.ctx ? await liveSetWriters(w.ctx, id, cmd.data.writers) : await mockSetWriters(id, cmd.data.writers);
  return out.ok ? NextResponse.json({ ok: true }) : err(out.status, out.error, out.message);
}
