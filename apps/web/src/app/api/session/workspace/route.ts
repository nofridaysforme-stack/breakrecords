import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { asUser } from '@breakrecords/db/client';
import { authRequired, getContext } from '@/server/context';
import { sql } from '@/server/db';
import { payoutErr as err } from '@/server/teamRoute';

/** Start a workspace of your own. You own it, it starts blank, and setup comes first. */
export async function POST(req: Request) {
  if (!authRequired()) return err(409, 'invalid', 'The sample data has one label.');
  const ctx = await getContext();
  if (!ctx) return err(401, 'unauthorized', 'Sign in to continue.');
  try {
    const [{ id }] = await asUser(sql, ctx.userId, (tx) => tx<{ id: string }[]>`SELECT app_start_workspace() AS id`);
    (await cookies()).set('br_tenant', id, { httpOnly: true, sameSite: 'lax', path: '/', secure: new URL(req.url).protocol === 'https:' });
    return NextResponse.json({ tenantId: id });
  } catch (e) {
    if ((e as { code?: string }).code === '22023') return err(409, 'invalid', 'You already run 10 workspaces you started.');
    throw e;
  }
}
