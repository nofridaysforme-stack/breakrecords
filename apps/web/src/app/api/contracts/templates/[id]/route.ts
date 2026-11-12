import { NextResponse } from 'next/server';
import { EditTemplateCommand } from '@breakrecords/contract';
import { getContracts, getTemplate } from '@/data/api';
import { mockEditTemplate } from '@/server/mockContracts';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';

type P = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: P) {
  const refused = await teamOnly('Contracts');
  if (refused) return refused;
  const t = await getTemplate((await params).id);
  return t ? NextResponse.json(t) : NextResponse.json({ error: 'not_found', message: 'No such template.' }, { status: 404 });
}

/** New wording for the workspace's own template, saved as a new version. Starters can't change; copy one first. */
export async function PUT(req: Request, { params }: P) {
  const who = await teamWriter('contracts', 'contracts');
  if ('refused' in who) return who.refused;
  const body = EditTemplateCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Every clause needs a title and its wording.');
  const id = (await params).id;
  if (who.ctx) {
    const out = await (await import('@/server/live/contracts')).liveEditTemplate(who.ctx, id, body.data);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const t = await getTemplate(id);
  if (!t) return err(404, 'not_found', 'No such template.');
  if (t.origin === 'starter') return err(409, 'conflict', 'Make your own copy first. Starter templates can’t be changed.');
  await mockEditTemplate(id, t, body.data);
  return NextResponse.json(await getContracts());
}
