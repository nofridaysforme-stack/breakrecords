import 'server-only';
import { cookies } from 'next/headers';
import type { UpdateRecordingCommand } from '@breakrecords/contract';
import { recordings } from '@/data/ops';
import { mockSession } from './session';
import { isIsrc, normalizeIsrc } from '@breakrecords/core/codes';

// Sample-data mode keeps recording edits per browser session, like approvals before Postgres.
type Edit = { genre?: string | null; ai?: string; isrc?: string | null };
const g = globalThis as unknown as { __brCatalogEdits?: Map<string, Record<string, Edit>> };
const store = (g.__brCatalogEdits ??= new Map());

/** This session's edits, without creating a session (safe in server components). */
export async function mockRecordingEdits(): Promise<Record<string, Edit>> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || {};
}

export async function mockUpdateRecording(slug: string, cmd: UpdateRecordingCommand) {
  const base = recordings.find((r) => r.id === slug);
  if (!base) return null;
  const session = await mockSession();
  const edits = store.get(session) ?? {};
  const next: Edit = { ...edits[slug] };
  if (cmd.isrc !== undefined) {
    const isrc = cmd.isrc ? normalizeIsrc(cmd.isrc) : null;
    if (isrc && !isIsrc(isrc)) return { ok: false as const, status: 400, error: 'invalid', message: 'An ISRC has 12 characters, like US-NL1-26-00014.' };
    const inUse = recordings.some((r) => r.id !== slug && ((edits[r.id]?.isrc !== undefined ? edits[r.id].isrc : r.isrc) === isrc));
    if (isrc && inUse) return { ok: false as const, status: 409, error: 'taken', message: 'Another recording in your catalog already has that ISRC.' };
    next.isrc = isrc;
  }
  if (cmd.genre !== undefined) next.genre = cmd.genre?.trim() || null;
  if (cmd.ai !== undefined) next.ai = cmd.ai;
  store.set(session, { ...edits, [slug]: next });
  // The sample's scores are fixed by design, so the mock keeps them.
  return { ...base, ...next };
}

/** Sets a recording's ISRC in this session (used when one is assigned from the prefix). */
export async function mockSetIsrc(slug: string, isrc: string) {
  const session = await mockSession();
  const edits = store.get(session) ?? {};
  store.set(session, { ...edits, [slug]: { ...edits[slug], isrc } });
}
/** Every ISRC in use in this session's catalog. */
export async function mockIsrcsInUse(): Promise<Set<string>> {
  const edits = await mockRecordingEdits();
  return new Set(recordings.map((r) => (edits[r.id]?.isrc !== undefined ? edits[r.id].isrc : r.isrc)).filter((x): x is string => !!x));
}
