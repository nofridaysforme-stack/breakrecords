import { NextResponse } from 'next/server';
import { getPayouts } from '@/data/api';
import { payeeRefused } from '@/server/payoutsRoute';

export async function GET() { return (await payeeRefused()) ?? NextResponse.json(await getPayouts()); }
