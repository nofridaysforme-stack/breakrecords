import { NextResponse } from 'next/server';
import { getUnclaimed } from '@/data/api';

export async function GET() { return NextResponse.json(await getUnclaimed()); }
