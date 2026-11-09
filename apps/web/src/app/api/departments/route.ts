import { NextResponse } from 'next/server';
import { getDepartments } from '@/data/api';
import { teamOnly } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('The activity log and departments')) ?? NextResponse.json(await getDepartments()); }
