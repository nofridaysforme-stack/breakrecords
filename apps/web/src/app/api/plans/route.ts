import { NextResponse } from 'next/server';
import { ApprovePlanCommand } from '@breakrecords/contract';
import { getPlans } from '@/data/api';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';

/** Approved Label Head plans with their progress. Owners and team. */
export async function GET() {
  const refused = await teamOnly('Plans');
  if (refused) return refused;
  return NextResponse.json(await getPlans());
}

/** Approves the plan for a goal: built again here from what the agents have open, saved with an approved plan card. */
export async function POST(req: Request) {
  const body = ApprovePlanCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Say the goal in a few words.');
  const who = await teamWriter('activity', 'plans');
  if ('refused' in who) return who.refused;
  if (!who.ctx) return err(409, 'not_live', 'Plans from the agents work on your live workspace.');
  const { liveApprovePlan, livePlans } = await import('@/server/agents/plans');
  const out = await liveApprovePlan(who.ctx, body.data.goal);
  if (!out.ok) return err(out.status, out.error, out.message);
  return NextResponse.json({ id: out.id, ...(await livePlans(who.ctx)) });
}
