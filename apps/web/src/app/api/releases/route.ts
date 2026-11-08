import { NextResponse } from 'next/server';
import { listReleases } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() {
  return (await teamOnly('Releases')) ?? NextResponse.json({ items: await listReleases() });
}
