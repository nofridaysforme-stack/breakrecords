import 'server-only';
import { cookies } from 'next/headers';
import { mockSession } from './session';

// Sample-data mode: contracts sent for review, per browser session.
type Review = { id: string; fileName: string; status: 'queued' | 'reviewed'; requested: string };
const g = globalThis as unknown as { __brReviews?: Map<string, Review[]> };
const store = (g.__brReviews ??= new Map());

export async function mockReviews(): Promise<Review[]> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || [];
}
export async function mockRequestReview(fileName: string): Promise<void> {
  const id = await mockSession();
  const list = store.get(id) ?? [];
  store.set(id, [{ id: `rv_${list.length + 1}`, fileName, status: 'queued', requested: 'Just now' }, ...list]);
}

// Sample-data mode: the sample label's template edits, per browser session. Each save is a new version.
type Wording = { summary: string; clauses: { title: string; text: string }[]; playbook: string[] };
type Edit = Wording & { versions: { version: string; saved: string }[] };
const eg = globalThis as unknown as { __brTplEdits?: Map<string, Record<string, Edit>> };
const edits = (eg.__brTplEdits ??= new Map());
export async function mockTemplateEdits(): Promise<Record<string, Edit>> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && edits.get(id)) || {};
}
export async function mockEditTemplate(slug: string, base: { version: string; history: { version: string; saved: string }[] }, w: Wording): Promise<void> {
  const id = await mockSession();
  const all = edits.get(id) ?? {};
  const prev = all[slug]?.versions ?? base.history;
  const n = Number(/^v(\d+)/.exec(prev[0]?.version ?? base.version)?.[1] ?? '1') + 1;
  const version = (prev[0]?.version ?? base.version).replace(/^v\d+/, `v${n}`);
  all[slug] = { ...w, versions: [{ version, saved: 'Just now' }, ...prev] };
  edits.set(id, all);
}
