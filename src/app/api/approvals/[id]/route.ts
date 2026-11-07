import { NextResponse } from 'next/server';
import { getApproval } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = getApproval((await params).id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
