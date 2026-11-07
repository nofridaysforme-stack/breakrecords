import { NextResponse } from 'next/server';
import { getRelease } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = getRelease((await params).id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
