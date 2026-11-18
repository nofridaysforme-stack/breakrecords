import { NextResponse } from 'next/server';
import { getAgents } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

/** What the agents found that's still open, and their last run. Owners and team. */
export async function GET() {
  const refused = await teamOnly('Agent findings');
  if (refused) return refused;
  return NextResponse.json(await getAgents());
}
