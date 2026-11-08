import { NextResponse } from 'next/server';
import { getContracts } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Contracts')) ?? NextResponse.json(await getContracts()); }
