import { NextResponse } from 'next/server';
import { getFunding } from '@/data/api';

export function GET() { return NextResponse.json(getFunding()); }
