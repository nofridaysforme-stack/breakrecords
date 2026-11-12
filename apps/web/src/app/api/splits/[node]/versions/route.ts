import { NextResponse } from 'next/server';
import { getSplitVersions } from '@/data/api';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockProposeVersion } from '@/server/mockMusic';
import { liveProposeVersion } from '@/server/live/splits';
import { splitError } from '@/server/splitsRoute';

/** A split's version in effect and its open one, line by line, with the release's songwriters. */
export async function GET(_req: Request, { params }: { params: Promise<{ node: string }> }) {
  const v = await getSplitVersions((await params).node);
  return v ? NextResponse.json(v) : splitError('not_found', 'This income has no split of its own.');
}

/** Starts a new version of a split that's in effect: a draft copy, with the same people. */
export async function POST(_req: Request, { params }: { params: Promise<{ node: string }> }) {
  const { node } = await params;
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return splitError('unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return splitError('forbidden', 'Only the label’s owner and team can change a split.');
    if (isLive('splits')) {
      const out = await liveProposeVersion(ctx, node);
      return out.ok ? NextResponse.json(await getSplitVersions(node)) : splitError(out.error, out.message);
    }
  }
  const out = await mockProposeVersion(node);
  return out.ok ? NextResponse.json(await getSplitVersions(node)) : splitError(out.error, out.message);
}
