import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { isLive } from '@/server/modules';

/**
 * The daily run (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`;
 * without that secret set, or on a server with the agents' data on sample data, it does nothing.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret ?? ''}`;
  if (!secret || given.length !== want.length || !timingSafeEqual(Buffer.from(given), Buffer.from(want))) {
    return NextResponse.json({ error: 'unauthorized', message: 'Not allowed.' }, { status: 401 });
  }
  if (!isLive('activity')) return NextResponse.json({ ok: true, skipped: 'Agents run only where the activity module is live.' });
  const out = await (await import('@/server/agents/run')).runAllAgents();
  return NextResponse.json({ ok: true, ...out });
}
