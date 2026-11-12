import { NextResponse } from 'next/server';
import { SubmitTaxFormCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockSubmitTaxForm } from '@/server/mockTax';
import { liveSubmitTaxForm } from '@/server/live/payouts';
import { payoutErr } from '@/server/teamRoute';

/**
 * A payee certifies their own tax form. Only the payee themselves: the label's team can ask
 * for one but never fill it in. Sample data: the previewed payee (Marco Dela by default).
 */
export async function POST(req: Request) {
  const body = SubmitTaxFormCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', body.error.issues[0]?.message ?? 'Check the form.');
  if (authRequired()) {
    const ctx = await getContext();
    if (!ctx) return payoutErr(401, 'unauthorized', 'Sign in to continue.');
    if (ctx.role !== 'payee') return payoutErr(403, 'forbidden', 'Only the payee can sign their own tax form. Ask them for it from Payouts.');
    if (isLive('payouts')) {
      const p = await liveSubmitTaxForm(ctx, body.data);
      return p ? NextResponse.json(p) : payoutErr(404, 'not_found', 'No payee record.');
    }
  }
  const as = new URL(req.url).searchParams.get('as') ?? 'marco-dela';
  const p = await mockSubmitTaxForm(as, body.data);
  return p ? NextResponse.json(p) : payoutErr(404, 'not_found', 'No such payee.');
}
