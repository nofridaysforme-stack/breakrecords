import { NextResponse } from 'next/server';
import { getSplitTree } from '@/data/api';

export async function GET() { return NextResponse.json(await getSplitTree()); }
