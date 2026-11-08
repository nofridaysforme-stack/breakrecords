import { NextResponse } from 'next/server';
import { getSettings } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Settings')) ?? NextResponse.json(await getSettings()); }
