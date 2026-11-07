import { NextResponse } from 'next/server';
import { getSettings } from '@/data/api';

export function GET() { return NextResponse.json(getSettings()); }
