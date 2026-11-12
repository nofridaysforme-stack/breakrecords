import { NextResponse } from 'next/server';
import { getFirstSplit } from '@/data/api';
import { splitError } from '@/server/splitsRoute';

/** A split's first version while it's still being agreed (draft, or out for signatures). */
export async function GET(_req: Request, { params }: { params: Promise<{ node: string }> }) {
  const f = await getFirstSplit((await params).node);
  return f ? NextResponse.json(f) : splitError('not_found', 'This split has no first version waiting on agreement.');
}
