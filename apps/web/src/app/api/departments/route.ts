import { NextResponse } from 'next/server';
import { getDepartments } from '@/data/api';

export function GET() { return NextResponse.json(getDepartments()); }
