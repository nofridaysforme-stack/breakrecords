import { NextResponse } from 'next/server';
import { getActivity } from '@/data/api';

export function GET() { return NextResponse.json(getActivity()); }
