import { NextResponse } from 'next/server';
import { listStatements } from '@/data/api';

/** Every payee statement the signed-in user may read. Live, a payee sees only their own. */
export async function GET() { return NextResponse.json({ items: await listStatements() }); }
