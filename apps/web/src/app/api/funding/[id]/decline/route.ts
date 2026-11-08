import { NextResponse } from 'next/server';
import { getOffers } from '@/data/api';
import { mockDecline, mockKnows } from '@/server/mockFunding';
import { liveDecline } from '@/server/live/funding';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

type Ctx = { params: Promise<{ id: string }> };

async function set(id: string, on: boolean) {
  const who = await teamWriter('funding', 'funding');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await liveDecline(who.ctx, id, on);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const f = mockKnows(id);
  if (!f) return err(404, 'not_found', 'No such offer.');
  if (f.kind === 'grant') return err(409, 'not_an_offer', 'A grant isn’t an offer to decline. Dismiss it instead.');
  await mockDecline(on);
  return NextResponse.json(await getOffers());
}

/** Decline an offer. Finance Agent drafts the reply; nothing is sent from here. Audited. */
export async function POST(_req: Request, { params }: Ctx) { return set((await params).id, true); }
/** Undo declining, before the reply goes out. */
export async function DELETE(_req: Request, { params }: Ctx) { return set((await params).id, false); }
