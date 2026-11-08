import { NextResponse } from 'next/server';
import { getSettings } from '@/data/api';
import { integrations } from '@/data/ops';
import { mockConnect } from '@/server/mockSettings';
import { liveConnect } from '@/server/live/settings';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/**
 * Connect an integration. The sample world pretends it connected; live, it says which stage
 * brings the real connection, because that needs the partner's account.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const who = await teamWriter('settings', 'settings');
  if ('refused' in who) return who.refused;
  if (who.ctx) { const out = await liveConnect(who.ctx, id); return err(out.status, out.error, out.message); }
  if (!integrations.some((i) => i.id === id)) return err(404, 'not_found', 'No such integration.');
  await mockConnect(id);
  return NextResponse.json(await getSettings());
}
