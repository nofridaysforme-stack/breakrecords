import { NextResponse } from 'next/server';
import { getTemplate } from '@/data/api';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = getTemplate((await params).id);
  return t ? NextResponse.json(t) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
