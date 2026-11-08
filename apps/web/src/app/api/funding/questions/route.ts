import { NextResponse } from 'next/server';
import { AskFundingQuestionCommand } from '@breakrecords/contract';
import { getOffers } from '@/data/api';
import { mockAsk } from '@/server/mockFunding';
import { liveAsk } from '@/server/live/funding';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Save a question for the offerers. Finance Agent drafts each email for the label to send. Audited. */
export async function POST(req: Request) {
  const body = AskFundingQuestionCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Type a question of up to 500 characters.');
  const who = await teamWriter('funding', 'funding');
  if ('refused' in who) return who.refused;
  if (who.ctx) return NextResponse.json(await liveAsk(who.ctx, body.data.question));
  await mockAsk(body.data.question);
  return NextResponse.json(await getOffers());
}
