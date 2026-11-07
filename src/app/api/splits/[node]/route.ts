import { NextResponse } from 'next/server';
import { getDeal } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ node: string }> }) {
  const deal = getDeal((await params).node);
  return deal ? NextResponse.json(deal) : NextResponse.json({ error: 'This node inherits its parent split' }, { status: 404 });
}
