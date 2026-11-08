import 'server-only';
import { cookies } from 'next/headers';
import { payouts, recoupment, type Recoup } from '@/data/money';
import { mockSession } from './session';

// Sample-data mode: requests sent to payees and costs added on 4e, per browser session.
type State = { requests: { payeeId: string; kind: 'tax_form' | 'bank_details' }[]; costs: { releaseId: string; category: string; cost: number; shareBp: number }[] };
const g = globalThis as unknown as { __brPayouts?: Map<string, State> };
const store = (g.__brPayouts ??= new Map());

async function read(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || { requests: [], costs: [] };
}
async function write(change: (s: State) => void): Promise<void> {
  const id = await mockSession();
  const s = store.get(id) ?? { requests: [], costs: [] };
  change(s);
  store.set(id, s);
}

export async function mockPayouts(): Promise<typeof payouts> {
  return { ...payouts, requests: (await read()).requests };
}

export type RequestOutcome = { ok: true } | { ok: false; status: number; error: 'not_found' | 'already_requested'; message: string };
export async function mockRequestFromPayee(payeeId: string, kind: 'tax_form' | 'bank_details'): Promise<RequestOutcome> {
  const known = payouts.taxForms.some((t) => t.payeeId === payeeId) || payouts.batches.some((b) => b.failed?.payeeId === payeeId);
  if (!known) return { ok: false, status: 404, error: 'not_found', message: 'No such payee.' };
  if ((await read()).requests.some((r) => r.payeeId === payeeId && r.kind === kind)) return { ok: false, status: 409, error: 'already_requested', message: 'Already requested. Waiting on them.' };
  await write((s) => { s.requests.push({ payeeId, kind }); });
  return { ok: true };
}

export async function mockRecoupment(): Promise<Recoup[]> {
  const { costs } = await read();
  return recoupment.map((r) => ({ ...r, costs: [...r.costs, ...costs.filter((c) => c.releaseId === r.id).map(({ category, cost, shareBp }) => ({ category, cost, shareBp }))] }));
}
export async function mockAddCost(c: State['costs'][number]): Promise<boolean> {
  if (!recoupment.some((r) => r.id === c.releaseId)) return false;
  await write((s) => { s.costs.push(c); });
  return true;
}
