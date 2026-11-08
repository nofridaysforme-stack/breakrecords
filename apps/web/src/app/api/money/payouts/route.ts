import { NextResponse } from 'next/server';
import { getPayouts } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Payouts')) ?? NextResponse.json(await getPayouts()); }
