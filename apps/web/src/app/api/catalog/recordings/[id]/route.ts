import { NextResponse } from 'next/server';
import { UpdateRecordingCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockUpdateRecording } from '@/server/mockCatalog';
import { liveUpdateRecording } from '@/server/live/catalog';

const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Change a recording's genre or AI use declaration. Owners and team only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cmd = UpdateRecordingCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Invalid change');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return err(403, 'forbidden', 'Only the label’s owner and team can change the catalog.');
    if (isLive('catalog')) {
      const r = await liveUpdateRecording(ctx, id, cmd.data);
      return r ? NextResponse.json(r) : err(404, 'not_found', `No recording ${id}.`);
    }
  }
  const r = await mockUpdateRecording(id, cmd.data);
  return r ? NextResponse.json(r) : err(404, 'not_found', `No recording ${id}.`);
}
