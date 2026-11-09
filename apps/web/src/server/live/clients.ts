import 'server-only';
import { withTenant } from '@breakrecords/db/client';
import type { ClientsResponse } from '@breakrecords/contract';
import { sql } from '../db';
import type { RequestContext } from '../context';

// Label services: each client is its own workspace under the services workspace. Its owners
// add clients and act as owners inside them; the database checks both (app_create_client,
// app_clients).

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function liveClients(ctx: RequestContext): Promise<ClientsResponse> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ id: string; name: string; kind: 'artist' | 'label'; created_at: Date; people: number }[]>`SELECT id, name, kind, created_at, people FROM app_clients()`;
    return { clients: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, added: day(r.created_at), people: r.people })) };
  });
}

export function liveCreateClient(ctx: RequestContext, c: { name: string; kind: 'artist' | 'label' }): Promise<{ ok: true; value: ClientsResponse; id: string } | { ok: false; status: number; error: 'forbidden'; message: string }> {
  if (ctx.tenantKind !== 'licensee' || ctx.role !== 'owner') return Promise.resolve({ ok: false, status: 403, error: 'forbidden', message: 'Only the owners of a label services workspace add clients.' });
  return withTenant(sql, ctx, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`SELECT app_create_client(${c.name}, ${c.kind}) AS id`;
    const rows = await tx<{ id: string; name: string; kind: 'artist' | 'label'; created_at: Date; people: number }[]>`SELECT id, name, kind, created_at, people FROM app_clients()`;
    return { ok: true, id, value: { clients: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, added: day(r.created_at), people: r.people })) } } as const;
  });
}
