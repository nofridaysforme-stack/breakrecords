import { NextResponse } from 'next/server';
import { CreateSplitCommand } from '@breakrecords/contract';
import { getSplitTree } from '@/data/api';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockCreateSplit } from '@/server/mockMusic';
import { liveCreateSplit } from '@/server/live/splits';
import { splitError } from '@/server/splitsRoute';

export async function GET() { return NextResponse.json(await getSplitTree()); }

/** A release's first split, as a draft. The workspace is the label; the release's artist the artist. */
export async function POST(req: Request) {
  const cmd = CreateSplitCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return splitError('invalid', cmd.error.issues[0]?.message ?? 'Check the split.');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return splitError('unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return splitError('forbidden', 'Only the workspace’s owners and team make splits.');
    if (isLive('splits')) {
      const out = await liveCreateSplit(ctx, cmd.data);
      return out.ok ? NextResponse.json({ node: out.node }) : NextResponse.json({ error: out.error, message: out.message }, { status: out.status });
    }
  }
  const out = await mockCreateSplit(cmd.data);
  return out.ok ? NextResponse.json({ node: out.value }) : NextResponse.json({ error: out.error, message: out.message }, { status: out.status });
}
