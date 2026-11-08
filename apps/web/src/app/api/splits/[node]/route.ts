import { NextResponse } from 'next/server';
import { getDeal } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ node: string }> }) {
  const deal = await getDeal((await params).node);
  return deal ? NextResponse.json(deal) : NextResponse.json({ error: 'not_found', message: 'This node inherits its parent’s split.' }, { status: 404 });
}
