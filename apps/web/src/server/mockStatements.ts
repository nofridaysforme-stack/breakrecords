import 'server-only';
import { cookies } from 'next/headers';
import { unmatchedNote } from '@breakrecords/core/statements';
import { royalties } from '@/data/money';
import { mockSession } from './session';

// Sample-data mode: lines matched from 4b's "Resolve" drawer, per browser session.
const g = globalThis as unknown as { __brMatchedIsrcs?: Map<string, Set<string>> };
const store = (g.__brMatchedIsrcs ??= new Map());

export type Royalties = typeof royalties;

function apply(matched: Set<string>): Royalties {
  if (!matched.size) return royalties;
  const done = royalties.unmatched.suggestions.filter((x) => matched.has(x.isrc));
  const suggestions = royalties.unmatched.suggestions.filter((x) => !matched.has(x.isrc));
  const lines = done.reduce((n, x) => n + x.count, 0);
  const value = done.reduce((n, x) => n + x.value, 0);
  const count = royalties.unmatched.count - lines;
  return {
    ...royalties,
    stats: { ...royalties.stats, matched: royalties.stats.matched + lines },
    unmatched: { ...royalties.unmatched, count, value: royalties.unmatched.value - value, suggestions, note: unmatchedNote(suggestions, royalties.unmatched.unknown.count) },
  };
}

export async function mockRoyalties(): Promise<Royalties> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return apply((id && store.get(id)) || new Set());
}

export type MatchOutcome = { ok: true; royalties: Royalties } | { ok: false; status: number; error: 'not_found' | 'nothing_to_match'; message: string };

export async function mockMatchLines(isrc: string, recordingId: string): Promise<MatchOutcome> {
  const session = await mockSession();
  const set = store.get(session) ?? new Set<string>();
  const code = isrc.trim().toUpperCase();
  const s = royalties.unmatched.suggestions.find((x) => x.isrc === code);
  if (!s || set.has(code)) return { ok: false, status: 409, error: 'nothing_to_match', message: `No unmatched lines carry ${code}.` };
  if (s.recordingId !== recordingId) return { ok: false, status: 404, error: 'not_found', message: 'That recording isn’t in the sample catalog for this ISRC.' };
  set.add(code);
  store.set(session, set);
  return { ok: true, royalties: apply(set) };
}
