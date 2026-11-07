import { NextResponse } from 'next/server';
import { getRoyalties } from '@/data/api';

export function GET() { return NextResponse.json(getRoyalties()); }
