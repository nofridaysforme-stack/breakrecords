import { NextResponse } from 'next/server';
import { RequestFromPayeeCommand } from '@breakrecords/contract';
import { getPayouts } from '@/data/api';
import { mockRequestFromPayee } from '@/server/mockPayouts';
import { liveRequestFromPayee } from '@/server/live/payouts';
import { payoutErr, payoutWriter } from '@/server/teamRoute';

/** Ask a payee for a tax form or new bank details. Recorded and audited; the payout provider sends it (Stage 3). */
export async function POST(req: Request) {
  const body = RequestFromPayeeCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', 'Send the payee and what to ask for: tax_form or bank_details.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const { payeeId, kind } = body.data;
  if (who.ctx) {
    const out = await liveRequestFromPayee(who.ctx, payeeId, kind);
    return out.ok ? NextResponse.json(out.value) : payoutErr(out.status, out.error, out.message);
  }
  const out = await mockRequestFromPayee(payeeId, kind);
  return out.ok ? NextResponse.json(await getPayouts()) : payoutErr(out.status, out.error, out.message);
}
