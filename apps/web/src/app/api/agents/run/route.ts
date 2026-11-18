import { NextResponse } from 'next/server';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Runs the agents now for this workspace (rules only). Live workspaces only; owners and team. */
export async function POST() {
  const who = await teamWriter('activity', 'the agents');
  if ('refused' in who) return who.refused;
  if (!who.ctx) return err(409, 'not_live', 'Agents run on your live workspace. Sample data shows what they reported before.');
  const { runAgents, liveAgents } = await import('@/server/agents/run');
  const result = await runAgents(who.ctx, 'manual');
  return NextResponse.json({ ...(await liveAgents(who.ctx)), result });
}
