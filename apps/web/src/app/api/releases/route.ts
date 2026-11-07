import { NextResponse } from 'next/server';
import { listReleases } from '@/data/api';

export function GET() {
  return NextResponse.json({ items: listReleases() });
}
