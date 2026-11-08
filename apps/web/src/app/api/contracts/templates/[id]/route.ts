import { NextResponse } from 'next/server';
import { getTemplate } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = await teamOnly('Contracts');
  if (refused) return refused;
  const t = await getTemplate((await params).id);
  return t ? NextResponse.json(t) : NextResponse.json({ error: 'not_found', message: 'No such template.' }, { status: 404 });
}
