import { NextResponse } from 'next/server';
import { getPayouts } from '@/data/api';

export function GET() { return NextResponse.json(getPayouts()); }
