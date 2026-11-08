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
