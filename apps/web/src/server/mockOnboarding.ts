import 'server-only';
import { cookies } from 'next/headers';
import { mockSession } from './session';

// Sample-data mode: onboarding answers per browser session.
type State = { answers: unknown; completed: boolean };
const g = globalThis as unknown as { __brOnboarding?: Map<string, State> };
const store = (g.__brOnboarding ??= new Map());

export async function mockOnboarding(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || { answers: null, completed: false };
}
export async function mockSaveOnboarding(answers: unknown, complete: boolean): Promise<State> {
  const id = await mockSession();
  const s = { answers, completed: complete || (store.get(id)?.completed ?? false) };
  store.set(id, s);
  return s;
}
