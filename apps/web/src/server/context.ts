import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { memberships, type Membership } from '@breakrecords/db/client';
import { MODULES } from '@breakrecords/contract';
import { auth } from './auth';
import { sql } from './db';
import { isLive } from './modules';

/**
 * BR_AUTH=required turns sign-in on (staging and production). It is off by default so the
 * mock app keeps running for local work, previews and the visual tests. Live data is never
 * served without sign-in: any live module with auth off is a configuration error.
 */
export function authRequired(): boolean {
  const on = process.env.BR_AUTH === 'required';
  if (!on && MODULES.some((m) => isLive(m))) {
    throw new Error('BR_LIVE_MODULES is set but BR_AUTH is not "required". Live data needs sign-in.');
  }
  return on;
}

export type RequestContext = {
  userId: string; email: string; tenantId: string; tenantName: string; tenantKind: Membership['kind']; role: Membership['role'];
  /** Every membership, connections included. */
  tenants: Membership[];
  /** Workspaces they run or work in (owner or team). */
  workspaces: Membership[];
  /** Labels that pay them: they're a payee there and see only what their deal covers. */
  connections: Membership[];
};

const TENANT_COOKIE = 'br_tenant';

/** The signed-in user and the tenant they're working in, or null. Cached per request. */
export const getContext = cache(async (): Promise<RequestContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email) return null;
  const tenants = await memberships(sql, userId);
  if (!tenants.length) return null;
  const wanted = (await cookies()).get(TENANT_COOKIE)?.value;
  const workspaces = tenants.filter((m) => m.role !== 'payee');
  const connections = tenants.filter((m) => m.role === 'payee');
  // Their own workspace comes first; a label that pays them opens only when they choose it.
  const t = tenants.find((m) => m.tenantId === wanted) ?? workspaces[0] ?? tenants[0];
  return { userId, email, tenantId: t.tenantId, tenantName: t.name, tenantKind: t.kind, role: t.role, tenants, workspaces, connections };
});

/** For pages: the context, or a redirect to sign in. */
export async function requireContext(): Promise<RequestContext> {
  const ctx = await getContext();
  if (!ctx) redirect('/sign-in');
  return ctx;
}
