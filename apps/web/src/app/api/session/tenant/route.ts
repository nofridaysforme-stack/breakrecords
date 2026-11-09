import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authRequired, getContext } from '@/server/context';
import { payoutErr as err } from '@/server/teamRoute';

const SwitchTenant = z.object({ tenantId: z.string().uuid() }).strict();

/** Switch the label you're working in. Only labels you belong to (or whose licensee you own). */
export async function POST(req: Request) {
  const body = SwitchTenant.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send the label to switch to.');
  if (!authRequired()) return err(409, 'invalid', 'The sample data has one label.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  const t = ctx.tenants.find((m) => m.tenantId === body.data.tenantId);
  if (!t) return err(403, 'forbidden', 'You don’t work in that label.');
  (await cookies()).set('br_tenant', t.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: new URL(req.url).protocol === 'https:' });
  return NextResponse.json({ tenantId: t.tenantId, name: t.name });
}
