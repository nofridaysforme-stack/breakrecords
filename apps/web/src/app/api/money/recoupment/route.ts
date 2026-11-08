import { NextResponse } from 'next/server';
import { getRecoupment } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Payouts')) ?? NextResponse.json({ items: await getRecoupment() }); }
