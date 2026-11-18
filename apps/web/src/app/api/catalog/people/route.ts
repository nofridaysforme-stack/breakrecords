import { NextResponse } from 'next/server';
import { getPeople } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

/** Everyone in the workspace, with what the rights forms still need about each. Owners and team. */
export async function GET() {
  const refused = await teamOnly('People');
  if (refused) return refused;
  return NextResponse.json(await getPeople());
}
