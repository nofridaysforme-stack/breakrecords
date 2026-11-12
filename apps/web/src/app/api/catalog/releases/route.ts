import { NextResponse } from 'next/server';
import { CreateReleaseCommand } from '@breakrecords/contract';
import { getCatalog } from '@/data/api';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockCreateRelease } from '@/server/mockMusic';
import { liveCreateRelease } from '@/server/live/catalog';

const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Adds a release and its recordings, in order. Returns the catalog. */
export async function POST(req: Request) {
  const cmd = CreateReleaseCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Check the release.');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return err(403, 'forbidden', 'Only the workspace’s owners and team add music.');
    if (isLive('catalog')) {
      const out = await liveCreateRelease(ctx, cmd.data);
      return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
    }
  }
  const out = await mockCreateRelease(cmd.data);
  return out.ok ? NextResponse.json(await getCatalog()) : err(out.status, out.error, out.message);
}
