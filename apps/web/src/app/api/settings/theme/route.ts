import { NextResponse } from 'next/server';
import { getTheme } from '@/data/api';

export function GET() { return NextResponse.json(getTheme()); }
