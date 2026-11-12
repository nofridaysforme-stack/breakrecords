import 'server-only';
import { NextResponse } from 'next/server';
import type { SyncResponse } from '@breakrecords/contract';
import { authRequired, getContext, type RequestContext } from './context';
import { isLive } from './modules';

/** Who may read sync: signed in as the label's owner or team. Null context means sample data. */
export async function syncReader(): Promise<{ ctx: RequestContext | null } | { refused: NextResponse }> {
  if (!authRequired()) return { ctx: null };
  const ctx = await getContext();
  if (!ctx) return { refused: NextResponse.json({ error: 'unauthorized', message: 'Sign in to continue.' }, { status: 401 }) };
  if (ctx.role === 'payee') return { refused: NextResponse.json({ error: 'forbidden', message: 'Sync licensing is for the label’s owner and team.' }, { status: 403 }) };
  return { ctx: isLive('contracts') ? ctx : null };
}
export async function getSync(ctx: RequestContext | null): Promise<SyncResponse> {
  return ctx ? (await import('./live/sync')).liveSync(ctx) : (await import('./mockSync')).mockSync();
}
export const syncErr = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });
