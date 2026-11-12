import { NextResponse } from 'next/server';
import { QuoteActionCommand } from '@breakrecords/contract';
import { approvalsBackend } from '@/server/approvals';
import { getSync, syncErr, syncReader } from '@/server/syncRoute';

/**
 * Move a quote on: sent, accepted (asks you to sign the license as an approval card), declined,
 * or paid (the fee recorded as sync income, only once the license is signed).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cmd = QuoteActionCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return syncErr(400, 'invalid', 'Send an action: send, accept, decline or paid.');
  const who = await syncReader();
  if ('refused' in who) return who.refused;
  const { id } = await params;
  const out = who.ctx
    ? await (await import('@/server/live/sync')).liveQuoteAction(who.ctx, id, cmd.data.action)
    : await (await import('@/server/mockSync')).mockQuoteAction(id, cmd.data.action, async (p) => (await approvalsBackend()).propose(p));
  if (!out.ok) return syncErr(out.status, out.error, out.message);
  return NextResponse.json('value' in out ? out.value : await getSync(null));
}
