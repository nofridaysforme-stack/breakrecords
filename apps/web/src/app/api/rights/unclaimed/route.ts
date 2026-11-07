import { NextResponse } from 'next/server';
import { getUnclaimed } from '@/data/api';

export function GET() { return NextResponse.json(getUnclaimed()); }
