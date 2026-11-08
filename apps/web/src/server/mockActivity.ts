import 'server-only';
import { cookies } from 'next/headers';
import type { Autonomy } from '@/components/ui/AutonomyDial';
import { mockSession } from './session';

// Sample-data mode: autonomy levels and hand-offs changed on 5f, per browser session.
type Change = { autonomy?: Autonomy; personId?: string | null };
const g = globalThis as unknown as { __brDepts?: Map<string, Record<string, Change>> };
const store = (g.__brDepts ??= new Map());

export async function mockDepartmentChanges(): Promise<Record<string, Change>> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || {};
}
export async function mockUpdateDepartment(dept: string, c: Change): Promise<void> {
  const id = await mockSession();
  const all = store.get(id) ?? {};
  all[dept] = { ...all[dept], ...c };
  store.set(id, all);
}
