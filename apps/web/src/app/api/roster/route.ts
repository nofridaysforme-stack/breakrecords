import { NextResponse } from 'next/server';
import { getRoster } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Roster cards')) ?? NextResponse.json(await getRoster()); }
