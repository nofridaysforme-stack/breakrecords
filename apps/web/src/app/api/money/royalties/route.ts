import { NextResponse } from 'next/server';
import { getRoyalties } from '@/data/api';
import { authRequired, getContext } from '@/server/context';

export async function GET() {
  if (authRequired() && (await getContext())?.role === 'payee') {
    return NextResponse.json({ error: 'forbidden', message: 'Royalties are for the label’s owner and team. Your statements are in the portal.' }, { status: 403 });
  }
  return NextResponse.json(await getRoyalties());
}
