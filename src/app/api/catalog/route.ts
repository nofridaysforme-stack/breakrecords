import { NextResponse } from 'next/server';
import { getCatalog } from '@/data/api';

export function GET() { return NextResponse.json(getCatalog()); }
