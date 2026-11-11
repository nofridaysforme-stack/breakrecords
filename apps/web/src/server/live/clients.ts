import 'server-only';
import { withTenant } from '@breakrecords/db/client';
import type { ClientsResponse } from '@breakrecords/contract';
import { sql } from '../db';
import type { RequestContext } from '../context';

// Label services: each client is its own workspace under the services workspace. Its owners
// add clients and act as owners inside them; the database checks both (app_create_client,
// app_clients).

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

type Tx = Parameters<Parameters<typeof withTenant>[2]>[0];
async function clientsIn(tx: Tx): Promise<ClientsResponse> {
  const rows = await tx<{ id: string; name: string; kind: 'artist' | 'label'; created_at: Date; people: number }[]>`SELECT id, name, kind, created_at, people FROM app_clients()`;
  // A client workspace can't have clients of its own; say whose client it is when that's visible.
  const [me] = await tx<{ parent_id: string | null; parent: string | null }[]>`
    SELECT t.parent_id, p.name AS parent FROM tenants t LEFT JOIN tenants p ON p.id = t.parent_id WHERE t.id = app_current_tenant()`;
  return {
    clients: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, added: day(r.created_at), people: r.people })),
    canAdd: !me?.parent_id, clientOf: me?.parent_id ? me.parent ?? 'another workspace' : null,
  };
}

export function liveClients(ctx: RequestContext): Promise<ClientsResponse> {
  return withTenant(sql, ctx, clientsIn);
}

export function liveCreateClient(ctx: RequestContext, c: { name: string; kind: 'artist' | 'label' }): Promise<{ ok: true; value: ClientsResponse; id: string } | { ok: false; status: number; error: 'forbidden'; message: string }> {
  if (ctx.role !== 'owner') return Promise.resolve({ ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners add clients.' });
  return withTenant(sql, ctx, async (tx) => {
    try {
      const [{ id }] = await tx.savepoint((sp) => sp<{ id: string }[]>`SELECT app_create_client(${c.name}, ${c.kind}) AS id`);
      return { ok: true, id, value: await clientsIn(tx) } as const;
    } catch (e) {
      if ((e as { code?: string }).code === '42501') {
        const m = (e as Error).message;
        return { ok: false, status: 403, error: 'forbidden', message: m.charAt(0).toUpperCase() + m.slice(1) + '.' } as const;
      }
      throw e;
    }
  });
}
