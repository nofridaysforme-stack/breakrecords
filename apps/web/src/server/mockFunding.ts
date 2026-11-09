import 'server-only';
import { cookies } from 'next/headers';
import { funding } from '@/data/ops';
import { mockSession } from './session';

// Sample-data mode: dismissed cards, a declined sale and saved questions, per browser session.
type State = { dismissed: Set<string>; declined: boolean; questions: { id: string; text: string; asked: string }[] };
const g = globalThis as unknown as { __brFunding?: Map<string, State> };
const store = (g.__brFunding ??= new Map());
const fresh = (): State => ({ dismissed: new Set(), declined: false, questions: [] });

export async function mockFundingState(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || fresh();
}
async function change(fn: (s: State) => void) {
  const id = await mockSession();
  const s = store.get(id) ?? fresh();
  fn(s);
  store.set(id, s);
}

export const mockKnows = (id: string) => funding.find((f) => f.id === id) ?? null;
export const mockDismiss = (id: string, on: boolean) => change((s) => { if (on) s.dismissed.add(id); else s.dismissed.delete(id); });
export const mockDecline = (on: boolean) => change((s) => { s.declined = on; });
export const mockAsk = (text: string) => change((s) => { s.questions.unshift({ id: `q_${s.questions.length + 1}`, text, asked: 'Just now' }); });
