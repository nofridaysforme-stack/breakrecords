import { NextResponse } from 'next/server';
import { getFunding } from '@/data/api';
import { mockDismiss, mockKnows } from '@/server/mockFunding';
import { liveDismiss } from '@/server/live/funding';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

type Ctx = { params: Promise<{ id: string }> };

async function set(id: string, on: boolean) {
  const who = await teamWriter('funding', 'funding');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await liveDismiss(who.ctx, id, on);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  if (!mockKnows(id)) return err(404, 'not_found', 'No such opportunity.');
  await mockDismiss(id, on);
  return NextResponse.json(await getFunding());
}

/** Dismiss a card. Funding Scout won't suggest it again. Audited. */
export async function POST(_req: Request, { params }: Ctx) { return set((await params).id, true); }
/** Undo a dismissal. */
export async function DELETE(_req: Request, { params }: Ctx) { return set((await params).id, false); }
