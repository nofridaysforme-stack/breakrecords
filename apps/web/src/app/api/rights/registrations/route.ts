import { NextResponse } from 'next/server';
import { getRegistrations } from '@/data/api';

export function GET() { return NextResponse.json(getRegistrations()); }
