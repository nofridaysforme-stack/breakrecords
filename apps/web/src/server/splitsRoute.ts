import 'server-only';
import { NextResponse } from 'next/server';
import { editDraft, send, sign } from '@breakrecords/core/splitVersions';
import { getDeal } from '@/data/api';
import { authRequired, getContext } from './context';
import { isLive } from './modules';
import { mockSplitWrite } from './mockSplits';
import { liveSplitWrite, type SplitWrite } from './live/splits';

const STATUS: Record<string, number> = { invalid: 400, invalid_terms: 400, unauthorized: 401, forbidden: 403, not_found: 404, not_draft: 409, not_100: 409, not_sent: 409, already_signed: 409, not_a_party: 409 };
export const splitError = (error: string, message: string) => NextResponse.json({ error, message }, { status: STATUS[error] ?? 400 });

/** Runs a split write in the right backend and answers with the updated node (or the contract's error). */
export async function splitWrite(slug: string, w: SplitWrite) {
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return splitError('unauthorized', 'Sign in to continue.');
    if (isLive('splits')) {
      const out = await liveSplitWrite(ctx, slug, w);
      if (!out.ok) return splitError(out.error, out.message);
      return NextResponse.json(await getDeal(slug));
    }
    if (ctx.role === 'payee' && w.kind !== 'sign') return splitError('forbidden', 'Only the label’s owner and team can change a split.');
  }
  if (slug !== 'gh-rec') return splitError('not_found', 'There is no open version of this split.');
  const today = new Date().toISOString().slice(0, 10);
  const out = await mockSplitWrite((v) => (w.kind === 'draft' ? editDraft(v, w.terms) : w.kind === 'send' ? send(v) : sign(v, w.role, today)));
  if (!out.ok) return splitError(out.error, out.message);
  return NextResponse.json(await getDeal(slug));
}
