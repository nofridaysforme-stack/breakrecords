import 'server-only';
import { NextResponse } from 'next/server';
import { authRequired, getContext, type RequestContext } from './context';
import { isLive } from './modules';

export const payoutErr = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/**
 * Who may write to payouts: signed in, and the label's owner or team (never a payee).
 * Returns the context when the live backend should handle it, null for the mock, or a refusal.
 */
export async function payoutWriter(): Promise<{ ctx: RequestContext | null } | { refused: NextResponse }> {
  if (!authRequired()) return { ctx: null };
  const ctx = await getContext();
  if (!ctx) return { refused: payoutErr(401, 'unauthorized', 'Sign in to continue.') };
  if (ctx.role === 'payee') return { refused: payoutErr(403, 'forbidden', 'Only the label’s owner and team manage payouts.') };
  return { ctx: isLive('payouts') ? ctx : null };
}

/** Reads only the label's owner and team may make; a payee has the portal instead. */
export async function teamOnly(what: string): Promise<NextResponse | null> {
  if (authRequired() && (await getContext())?.role === 'payee') return payoutErr(403, 'forbidden', `${what} are for the label’s owner and team. Yours are in the portal.`);
  return null;
}
