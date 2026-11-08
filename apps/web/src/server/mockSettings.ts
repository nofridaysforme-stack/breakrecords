import 'server-only';
import { cookies } from 'next/headers';
import type { ThemeColors } from '@/lib/theme';
import { mockSession } from './session';

// Sample-data mode: a published theme and integrations connected on 5h, per browser session.
type State = { theme: ThemeColors | null; connected: Set<string> };
const g = globalThis as unknown as { __brSettings?: Map<string, State> };
const store = (g.__brSettings ??= new Map());
const fresh = (): State => ({ theme: null, connected: new Set() });

export async function mockSettingsState(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || fresh();
}
async function change(fn: (s: State) => void) {
  const id = await mockSession();
  const s = store.get(id) ?? fresh();
  fn(s);
  store.set(id, s);
}
export const mockPublishTheme = (t: ThemeColors) => change((s) => { s.theme = t; });
export const mockConnect = (id: string) => change((s) => { s.connected.add(id); });
