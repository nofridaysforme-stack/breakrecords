import 'server-only';
import { cookies } from 'next/headers';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import type { SplitOutcome, VersionState } from '@breakrecords/core/splitVersions';
import { glasshouseDeal } from '@/data/money';
import { mockSession } from './session';

// Sample-data mode: the Glasshouse draft v5 (terms, sent, signatures) per browser session,
// as the editor and portal kept it in the browser before.
const g = globalThis as unknown as { __brSplits?: Map<string, VersionState> };
const store = (g.__brSplits ??= new Map());
const initial = (): VersionState => ({ status: 'draft', terms: glasshouseDeal.v5.terms as DealTerms, signed: {} });

export async function mockSplitState(): Promise<VersionState> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || initial();
}

export async function mockSplitWrite(run: (v: VersionState) => SplitOutcome): Promise<SplitOutcome> {
  const session = await mockSession();
  const out = run(store.get(session) ?? initial());
  if (out.ok) store.set(session, out.state);
  return out;
}
