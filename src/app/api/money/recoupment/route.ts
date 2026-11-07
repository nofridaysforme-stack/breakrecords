import { NextResponse } from 'next/server';
import { getRecoupment } from '@/data/api';

export function GET() { return NextResponse.json({ items: getRecoupment() }); }
