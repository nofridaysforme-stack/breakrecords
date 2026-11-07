import { NextResponse } from 'next/server';
import { getCatalog } from '@/data/api';

export async function GET() { return NextResponse.json(await getCatalog()); }
