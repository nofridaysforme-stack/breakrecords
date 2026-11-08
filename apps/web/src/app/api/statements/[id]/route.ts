import { NextResponse } from 'next/server';
import { getStatement } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const st = await getStatement((await params).id);
  return st ? NextResponse.json(st) : NextResponse.json({ error: 'not_found', message: 'No such statement.' }, { status: 404 });
}
