import { NextResponse } from 'next/server';
import { SetAiAssistCommand } from '@breakrecords/contract';
import { payoutErr, teamWriter } from '@/server/teamRoute';

/** Owners turn AI review on or off for their label. */
export async function POST(req: Request) {
  const parsed = SetAiAssistCommand.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return payoutErr(400, 'invalid', 'Send { "on": true } or { "on": false }.');
  const w = await teamWriter('documents', 'AI review');
  if ('refused' in w) return w.refused;
  if (!w.ctx) return NextResponse.json(await (await import('@/server/mockDocuments')).mockSetAiAssist(parsed.data.on));
  const r = await (await import('@/server/live/documents')).liveSetAiAssist(w.ctx, parsed.data.on);
  return r.ok ? NextResponse.json(r.value) : payoutErr(r.status, r.error, r.message);
}
