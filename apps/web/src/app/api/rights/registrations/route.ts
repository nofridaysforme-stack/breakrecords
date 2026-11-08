import { NextResponse } from 'next/server';
import { getRegistrations } from '@/data/api';

export async function GET() { return NextResponse.json(await getRegistrations()); }
