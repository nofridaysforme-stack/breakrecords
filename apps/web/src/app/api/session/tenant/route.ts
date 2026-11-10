import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { SessionResponse } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { payoutErr as err } from '@/server/teamRoute';

const SwitchTenant = z.object({ tenantId: z.string().uuid() }).strict();

/** Where you are, the workspaces you run or work in, and the labels that pay you. */
export async function GET() {
  if (!authRequired()) return err(409, 'invalid', 'The sample data has one label.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  const body: z.infer<typeof SessionResponse> = {
    current: ctx.tenantId,
    workspaces: ctx.workspaces.map((t) => ({ id: t.tenantId, name: t.name, kind: t.kind, role: t.role as 'owner' | 'team' })),
    connections: ctx.connections.map((t) => ({ id: t.tenantId, name: t.name, kind: t.kind })),
  };
  return NextResponse.json(body);
}

/**
 * Switch to a workspace you belong to (or whose licensee you own), or open a label that pays
 * you, where you see only what your deal covers.
 */
export async function POST(req: Request) {
  const body = SwitchTenant.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send the workspace to switch to.');
  if (!authRequired()) return err(409, 'invalid', 'The sample data has one label.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  const t = ctx.tenants.find((m) => m.tenantId === body.data.tenantId);
  if (!t) return err(403, 'forbidden', 'You don’t work in that workspace.');
  (await cookies()).set('br_tenant', t.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: new URL(req.url).protocol === 'https:' });
  return NextResponse.json({ tenantId: t.tenantId, name: t.name, role: t.role });
}
