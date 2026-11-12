import { NextResponse } from 'next/server';
import { getTemplate } from '@/data/api';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Makes the workspace's own copy of a starter template, so its wording can be changed. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await teamWriter('contracts', 'contracts');
  if ('refused' in who) return who.refused;
  const id = (await params).id;
  if (who.ctx) {
    const out = await (await import('@/server/live/contracts')).liveCopyStarter(who.ctx, id);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  // Sample data: every template is already the sample label's own.
  return (await getTemplate(id)) ? err(409, 'conflict', 'This workspace already has its own copy of this template.') : err(404, 'not_found', 'No such starter template.');
}
