import { NextResponse } from 'next/server';
import { getRecoupment } from '@/data/api';
import { payeeRefused } from '@/server/payoutsRoute';

export async function GET() { return (await payeeRefused()) ?? NextResponse.json({ items: await getRecoupment() }); }
