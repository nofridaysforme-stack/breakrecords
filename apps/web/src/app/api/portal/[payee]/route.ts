import { NextResponse } from 'next/server';
import { getPayee } from '@/data/api';

/** One payee's portal. Live, a payee can only get themselves; anyone else is not found. */
export async function GET(_req: Request, { params }: { params: Promise<{ payee: string }> }) {
  const p = await getPayee((await params).payee);
  return p ? NextResponse.json(p) : NextResponse.json({ error: 'not_found', message: 'No such payee.' }, { status: 404 });
}
