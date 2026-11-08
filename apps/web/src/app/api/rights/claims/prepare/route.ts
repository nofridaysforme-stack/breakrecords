import { NextResponse } from 'next/server';
import { PrepareProfileClaimsCommand } from '@breakrecords/contract';
import { getProfileClaims } from '@/data/api';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockPrepareClaims } from '@/server/mockRights';
import { livePrepareProfileClaims } from '@/server/live/rights';

const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Rights Agent prepares every profile claim not yet started. Returns the updated claims. */
export async function POST(req: Request) {
  if (!PrepareProfileClaimsCommand.safeParse(await req.json().catch(() => ({}))).success) return err(400, 'invalid', 'Send an empty object.');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role === 'payee') return err(403, 'forbidden', 'Only the label’s owner and team can manage profile claims.');
    if (isLive('registrations')) return NextResponse.json(await livePrepareProfileClaims(ctx));
  }
  await mockPrepareClaims();
  return NextResponse.json(await getProfileClaims());
}
