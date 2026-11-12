import { NextResponse } from 'next/server';
import { getSync, syncReader } from '@/server/syncRoute';

/** Briefs and their quotes, and the recordings that can be offered (with one-stop status). */
export async function GET() {
  const who = await syncReader();
  if ('refused' in who) return who.refused;
  return NextResponse.json(await getSync(who.ctx));
}
