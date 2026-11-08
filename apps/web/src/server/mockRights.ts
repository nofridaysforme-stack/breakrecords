import 'server-only';
import { cookies } from 'next/headers';
import { mockSession } from './session';

// Sample-data mode remembers "Prepare the rest" per browser session.
const g = globalThis as unknown as { __brClaimsPrepared?: Set<string> };
const prepared = (g.__brClaimsPrepared ??= new Set());

export async function mockClaimsPrepared(): Promise<boolean> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return !!id && prepared.has(id);
}

export async function mockPrepareClaims(): Promise<void> {
  prepared.add(await mockSession());
}
