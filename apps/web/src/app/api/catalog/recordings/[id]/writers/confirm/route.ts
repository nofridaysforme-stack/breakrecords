import { NextResponse } from 'next/server';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { liveConfirmWriter } from '@/server/live/splits';
import { payoutErr as err } from '@/server/teamRoute';

/** A writer confirms their own share of the song (a recording on the label's screens, or a song in their portal). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authRequired() || !isLive('catalog')) return err(409, 'invalid', 'Writers confirm their own share when signed in. Sample data has no writer logins.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  const out = await liveConfirmWriter(ctx, (await params).id);
  return out.ok ? NextResponse.json({ ok: true }) : err(out.status, out.error, out.message);
}
