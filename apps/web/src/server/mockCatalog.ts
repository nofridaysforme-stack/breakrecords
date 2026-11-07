import 'server-only';
import { cookies } from 'next/headers';
import type { UpdateRecordingCommand } from '@breakrecords/contract';
import { recordings } from '@/data/ops';
import { mockSession } from './session';

// Sample-data mode keeps recording edits per browser session, like approvals before Postgres.
type Edit = { genre?: string | null; ai?: string };
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
  if (cmd.genre !== undefined) next.genre = cmd.genre?.trim() || null;
  if (cmd.ai !== undefined) next.ai = cmd.ai;
  store.set(session, { ...edits, [slug]: next });
  // The sample's scores are fixed by design, so the mock keeps them.
  return { ...base, ...next };
}
