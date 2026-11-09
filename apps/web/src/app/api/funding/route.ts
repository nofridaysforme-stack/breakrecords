import { NextResponse } from 'next/server';
import { getFunding } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Funding')) ?? NextResponse.json(await getFunding()); }
