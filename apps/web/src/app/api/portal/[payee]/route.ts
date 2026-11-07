import { NextResponse } from 'next/server';
import { getPayee } from '@/data/api';

export async function GET(_req: Request, { params }: { params: Promise<{ payee: string }> }) {
  const p = getPayee((await params).payee);
  return p ? NextResponse.json(p) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
