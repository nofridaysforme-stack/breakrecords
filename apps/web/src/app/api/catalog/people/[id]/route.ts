import { NextResponse } from 'next/server';
import { UpdatePersonCommand } from '@breakrecords/contract';
import { getPerson } from '@/data/api';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';

/** One person or company: what's on file, what's missing, and where they appear. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = await teamOnly('People');
  if (refused) return refused;
  const p = await getPerson((await params).id);
  return p ? NextResponse.json(p) : err(404, 'not_found', 'No such person in this workspace.');
}

/** Change what's on file: legal name, PRO, IPI, ISNI, email, phone, address, citizenship, home country. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdatePersonCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Check the details and try again.');
  const who = await teamWriter('catalog', 'the catalog');
  if ('refused' in who) return who.refused;
  const out = who.ctx
    ? await (await import('@/server/live/people')).liveUpdatePerson(who.ctx, id, body.data)
    : await (await import('@/server/mockPeople')).mockUpdatePerson(id, body.data);
  return out ? NextResponse.json(out) : err(404, 'not_found', 'No such person in this workspace.');
}
