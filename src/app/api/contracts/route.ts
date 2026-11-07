import { NextResponse } from 'next/server';
import { getContracts } from '@/data/api';

export function GET() { return NextResponse.json(getContracts()); }
