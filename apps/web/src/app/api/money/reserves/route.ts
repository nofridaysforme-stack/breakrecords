import { NextResponse } from 'next/server';
import { OpenFlagCommand } from '@breakrecords/contract';
import { getReserves } from '@/data/api';
import { mockOpenFlag } from '@/server/mockReserves';
import { liveOpenFlag } from '@/server/live/reserves';
import { payoutErr, payoutWriter, teamOnly } from '@/server/teamRoute';

/** Audit flags and the income each one holds. */
export async function GET() { return (await teamOnly('Reserves')) ?? NextResponse.json(await getReserves()); }

/** Flags a recording: its income in months not yet paid out is held until the flag is resolved. */
export async function POST(req: Request) {
  const body = OpenFlagCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return payoutErr(400, 'invalid', 'Pick a recording and say why it’s flagged.');
  const who = await payoutWriter();
  if ('refused' in who) return who.refused;
  const out = who.ctx ? await liveOpenFlag(who.ctx, body.data.recordingId, body.data.note) : await mockOpenFlag(body.data.recordingId, body.data.note);
  if (!out.ok) return payoutErr(out.status, out.error, out.message);
  return NextResponse.json('value' in out ? out.value : await getReserves());
}
