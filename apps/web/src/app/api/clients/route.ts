import { NextResponse } from 'next/server';
import { CreateClientCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { payoutErr as err } from '@/server/teamRoute';

/** Label services only. With sign-in off (sample data) there are no client workspaces. */
async function services() {
  if (!authRequired()) return { refused: err(409, 'not_available', 'Client workspaces work when sign-in is on.') } as const;
  const ctx = await getContext();
  if (!ctx) return { refused: err(401, 'unauthorized', 'Sign in to continue.') } as const;
  if (ctx.tenantKind !== 'licensee' || ctx.role !== 'owner') return { refused: err(403, 'forbidden', 'Clients are for the owners of a label services workspace.') } as const;
  return { ctx } as const;
}

export async function GET() {
  const w = await services();
  if ('refused' in w) return w.refused;
  return NextResponse.json(await (await import('@/server/live/clients')).liveClients(w.ctx));
}

/** Adds a client: their own workspace under yours. Audited. */
export async function POST(req: Request) {
  const body = CreateClientCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Give the client a name and say whether they’re an artist or a label.');
  const w = await services();
  if ('refused' in w) return w.refused;
  const r = await (await import('@/server/live/clients')).liveCreateClient(w.ctx, body.data);
  return r.ok ? NextResponse.json({ ...r.value, created: r.id }) : err(r.status, r.error, r.message);
}
