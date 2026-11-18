import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';
import type { StartAssetUploadCommand } from '@breakrecords/contract';
import { withTenant } from '@breakrecords/db/client';
import { sql } from './db';
import type { RequestContext } from './context';
import { mockSession } from './session';

// Asset files: a row for each upload, the file itself in private storage. Live rows are the
// workspace's own; sample-data uploads are kept per browser session.

export type AssetStart = z.infer<typeof StartAssetUploadCommand>;
export type AssetRef = { id: string; key: string; name: string; contentType: string | null; size: number | null; ready: boolean };
export type AssetOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string };

const safe = (name: string) => name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-120) || 'file';
const keyFor = (scope: string, id: string, name: string) => `assets/${scope}/${id}/${safe(name)}`;

// ---------- live ----------
export function liveStartAsset(ctx: RequestContext, c: AssetStart): Promise<AssetOutcome<AssetRef>> {
  return withTenant(sql, ctx, async (tx) => {
    let releaseId: string | null = null; let recordingId: string | null = null;
    if (c.releaseId) {
      releaseId = (await tx<{ id: string }[]>`SELECT id FROM releases WHERE slug = ${c.releaseId}`)[0]?.id ?? null;
      if (!releaseId) return { ok: false, status: 404, error: 'not_found', message: 'That release isn’t in this workspace.' } as const;
    }
    if (c.recordingId) {
      recordingId = (await tx<{ id: string }[]>`SELECT id FROM recordings WHERE slug = ${c.recordingId}`)[0]?.id ?? null;
      if (!recordingId) return { ok: false, status: 404, error: 'not_found', message: 'That recording isn’t in this workspace.' } as const;
    }
    const id = crypto.randomUUID();
    const key = keyFor(ctx.tenantId, id, c.name);
    await tx`INSERT INTO assets (id, tenant_id, name, kind, release_id, recording_id, ready, storage_key, file_name, content_type, uploaded_by)
      VALUES (${id}, ${ctx.tenantId}, ${c.name}, ${c.kind}, ${releaseId}, ${recordingId}, false, ${key}, ${c.name}, ${c.contentType ?? null}, ${ctx.userId})`;
    return { ok: true, value: { id, key, name: c.name, contentType: c.contentType ?? null, size: null, ready: false } } as const;
  });
}

export function liveAsset(ctx: RequestContext, id: string): Promise<AssetRef | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return Promise.resolve(null);
  return withTenant(sql, ctx, async (tx) => {
    const [a] = await tx<{ id: string; storage_key: string | null; name: string; content_type: string | null; size_bytes: string | null; ready: boolean }[]>`
      SELECT id, storage_key, name, content_type, size_bytes, ready FROM assets WHERE id = ${id}`;
    return a?.storage_key ? { id: a.id, key: a.storage_key, name: a.name, contentType: a.content_type, size: a.size_bytes ? Number(a.size_bytes) : null, ready: a.ready } : null;
  });
}

export function liveFinishAsset(ctx: RequestContext, id: string, size: number): Promise<void> {
  return withTenant(sql, ctx, async (tx) => {
    await tx`UPDATE assets SET ready = true, size_bytes = ${size} WHERE id = ${id}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-AST-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'asset.uploaded', ${id}, ${tx.json({ size })})`;
  });
}

// ---------- sample data ----------
type MockAsset = AssetRef & { kind: AssetStart['kind']; release: string | null };
const g = globalThis as unknown as { __brAssets?: Map<string, MockAsset[]> };
const store = (g.__brAssets ??= new Map());

export async function mockAssets(): Promise<MockAsset[]> {
  const s = (await cookies()).get('br_mock_session')?.value;
  return (s && store.get(s)) || [];
}
export async function mockStartAsset(c: AssetStart, releaseTitle: string | null): Promise<AssetRef> {
  const s = await mockSession();
  const id = crypto.randomUUID();
  const a: MockAsset = { id, key: keyFor(`mock-${s.slice(0, 12)}`, id, c.name), name: c.name, contentType: c.contentType ?? null, size: null, ready: false, kind: c.kind, release: releaseTitle };
  store.set(s, [...(store.get(s) ?? []), a]);
  return a;
}
export async function mockAsset(id: string): Promise<MockAsset | null> {
  return (await mockAssets()).find((a) => a.id === id) ?? null;
}
export async function mockFinishAsset(id: string, size: number): Promise<void> {
  const a = await mockAsset(id);
  if (a) { a.ready = true; a.size = size; }
}

/** "4.2 MB" */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
