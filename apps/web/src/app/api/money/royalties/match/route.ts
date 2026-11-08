import { NextResponse } from 'next/server';
import { MatchLinesCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockMatchLines } from '@/server/mockStatements';
import { liveMatchLines } from '@/server/live/statements';

const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Matches every unmatched line carrying an ISRC to a recording (4b "Resolve"). Returns Royalties. */
export async function POST(req: Request) {
  const body = MatchLinesCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send the reported ISRC and the recording to match it to.');
  const { isrc, recordingId } = body.data;
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return err(403, 'forbidden', 'Only the label’s owner and team can match statement lines.');
    if (isLive('statements')) {
      const out = await liveMatchLines(ctx, isrc, recordingId);
      return out.ok ? NextResponse.json(out.royalties) : err(out.status, out.error, out.message);
    }
  }
  const out = await mockMatchLines(isrc, recordingId);
  return out.ok ? NextResponse.json(out.royalties) : err(out.status, out.error, out.message);
}
