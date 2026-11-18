import 'server-only';
import { liveAsset, mockAsset, type AssetRef } from '@/server/assets';
import { teamWriter } from '@/server/teamRoute';
import type { NextResponse } from 'next/server';

/** The asset this person may touch, and whether it's live, or a refusal. */
export async function assetFor(id: string): Promise<{ refused: NextResponse } | { asset: AssetRef | null; live: boolean; ctx: Awaited<ReturnType<typeof teamWriter>> }> {
  const who = await teamWriter('catalog', 'the catalog');
  if ('refused' in who) return { refused: who.refused };
  return { asset: who.ctx ? await liveAsset(who.ctx, id) : await mockAsset(id), live: !!who.ctx, ctx: who };
}
