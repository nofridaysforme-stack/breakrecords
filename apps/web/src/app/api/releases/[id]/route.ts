import { NextResponse } from 'next/server';
import { getRelease } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = await teamOnly('Releases');
  if (refused) return refused;
  const item = await getRelease((await params).id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'not_found', message: 'No such release.' }, { status: 404 });
}
