import { NextResponse } from 'next/server';
import { getRoster } from '@/data/api';

export function GET() { return NextResponse.json(getRoster()); }
