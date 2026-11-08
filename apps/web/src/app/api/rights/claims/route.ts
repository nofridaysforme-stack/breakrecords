import { NextResponse } from 'next/server';
import { getProfileClaims } from '@/data/api';

export async function GET() { return NextResponse.json(await getProfileClaims()); }
