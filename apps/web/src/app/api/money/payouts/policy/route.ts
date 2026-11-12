import { NextResponse } from 'next/server';
import { SetMissingFormPolicyCommand } from '@breakrecords/contract';
import { getPayouts } from '@/data/api';
import { mockSetPolicy } from '@/server/mockTax';
import { liveSetMissingFormPolicy } from '@/server/live/payouts';
import { payoutErr, payoutWriter } from '@/server/teamRoute';

/** What happens to a payee with no valid tax form: hold their payout, or pay with 24% backup withholding. */
export async function PUT(req: Request) {
  const body = SetMissingFormPolicyCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', 'Send missingFormPolicy: hold or withhold.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  if (who.ctx) return NextResponse.json(await liveSetMissingFormPolicy(who.ctx, body.data.missingFormPolicy));
  await mockSetPolicy(body.data.missingFormPolicy);
  return NextResponse.json(await getPayouts());
}
