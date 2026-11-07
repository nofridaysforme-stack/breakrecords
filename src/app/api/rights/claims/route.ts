import { NextResponse } from 'next/server';
import { getProfileClaims } from '@/data/api';

export function GET() { return NextResponse.json(getProfileClaims()); }
