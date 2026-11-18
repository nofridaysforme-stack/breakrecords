import { NextResponse } from 'next/server';
import { getPlanDraft } from '@/data/api';
import { payoutErr as err, teamOnly } from '@/server/teamRoute';

/** A goal turned into a plan from what the agents have open. Changes nothing. */
export async function GET(req: Request) {
  const refused = await teamOnly('Plans');
  if (refused) return refused;
  const goal = (new URL(req.url).searchParams.get('goal') ?? '').trim().slice(0, 200);
  if (!goal) return err(400, 'invalid', 'Say the goal in a few words.');
  const draft = await getPlanDraft(goal);
  return draft ? NextResponse.json(draft) : err(409, 'not_live', 'Plans from the agents work on your live workspace.');
}
