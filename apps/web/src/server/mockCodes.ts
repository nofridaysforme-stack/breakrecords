import 'server-only';
import { cookies } from 'next/headers';
import { gs1Capacity, isGs1Prefix, isIsrcPrefix, isUpc, isrcFor, normalizeIsrcPrefix, normalizeUpc, upcFor } from '@breakrecords/core/codes';
import type { CodesResponse } from '@breakrecords/contract';
import { catalogReleases, recordings } from '@/data/ops';
import { mockSession } from './session';
import { mockIsrcsInUse, mockRecordingEdits, mockSetIsrc } from './mockCatalog';

// Sample-data mode: prefixes, counters and UPC edits per browser session, numbered the same way
// as the database does it (packages/core/src/codes.ts).

type State = { isrcPrefix: string | null; isrcNext: number; gs1Prefix: string | null; upcNext: number; upcs: Record<string, string | null> };
const g = globalThis as unknown as { __brCodes?: Map<string, State> };
const store: Map<string, State> = (g.__brCodes ??= new Map());
const fresh = (): State => ({ isrcPrefix: null, isrcNext: 1, gs1Prefix: null, upcNext: 1, upcs: {} });
const read = async () => store.get((await cookies()).get('br_mock_session')?.value ?? '') ?? fresh();
const write = async (f: (s: State) => void) => { const id = await mockSession(); const s = store.get(id) ?? fresh(); f(s); store.set(id, s); return s; };

const view = (s: State): CodesResponse => ({
  isrcPrefix: s.isrcPrefix, gs1Prefix: s.gs1Prefix,
  nextIsrc: s.isrcPrefix && s.isrcNext <= 99999 ? isrcFor(s.isrcPrefix, new Date().getUTCFullYear(), s.isrcNext) : null,
  nextUpc: s.gs1Prefix && s.upcNext <= gs1Capacity(s.gs1Prefix) ? upcFor(s.gs1Prefix, s.upcNext) : null,
  canChange: true,
});

export const mockCodes = async () => view(await read());
/** This session's UPC changes, by release id. */
export const mockUpcEdits = async () => (await read()).upcs;

type Err = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Err => ({ ok: false, status, error, message });

export async function mockSetCodePrefixes(c: { isrcPrefix: string | null; gs1Prefix: string | null }): Promise<{ ok: true; value: CodesResponse } | Err> {
  const isrc = c.isrcPrefix ? normalizeIsrcPrefix(c.isrcPrefix) : null;
  const gs1 = c.gs1Prefix ? normalizeUpc(c.gs1Prefix) : null;
  if (isrc && !isIsrcPrefix(isrc)) return fail(400, 'invalid', 'An ISRC prefix is the country code and your registrant code, like US-NL1.');
  if (gs1 && !isGs1Prefix(gs1)) return fail(400, 'invalid', 'A GS1 company prefix is 6 to 10 digits, as GS1 gave it to you.');
  const s = await write((st) => {
    if (st.isrcPrefix !== isrc) st.isrcNext = 1;
    if (st.gs1Prefix !== gs1) st.upcNext = 1;
    st.isrcPrefix = isrc; st.gs1Prefix = gs1;
  });
  return { ok: true, value: view(s) };
}

export async function mockSetUpc(id: string, value: string | null): Promise<{ ok: true; upc: string | null } | Err> {
  if (!catalogReleases.some((r) => r.id === id)) return fail(404, 'not_found', 'No such release.');
  const upc = value ? normalizeUpc(value) : null;
  if (upc && !isUpc(upc)) return fail(400, 'invalid', 'That isn’t a valid UPC: it should be 12 digits (or a 13-digit EAN) with a correct last digit.');
  const edits = (await read()).upcs;
  const current = (r: { id: string; upc: string | null }) => (edits[r.id] !== undefined ? edits[r.id] : r.upc);
  if (upc && catalogReleases.some((r) => r.id !== id && current(r) === upc)) return fail(409, 'taken', 'That UPC is already in use.');
  await write((st) => { st.upcs[id] = upc; });
  return { ok: true, upc };
}

export async function mockAssignCode(kind: 'isrc' | 'upc', id: string): Promise<{ ok: true; code: string } | Err> {
  const s = await read();
  if (kind === 'isrc') {
    const rec = recordings.find((r) => r.id === id);
    if (!rec) return fail(404, 'not_found', 'No such recording.');
    const edits = await mockRecordingEdits();
    if ((edits[id]?.isrc !== undefined ? edits[id].isrc : rec.isrc)) return fail(409, 'taken', 'This recording already has an ISRC.');
    if (!s.isrcPrefix) return fail(409, 'not_set', 'Set your ISRC prefix in Settings first.');
    const used = await mockIsrcsInUse();
    let n = s.isrcNext; let code = '';
    for (; n <= 99999; n++) { code = isrcFor(s.isrcPrefix, new Date().getUTCFullYear(), n); if (!used.has(code)) break; }
    if (n > 99999) return fail(409, 'not_set', 'This year’s ISRCs for your prefix are used up.');
    await mockSetIsrc(id, code);
    await write((st) => { st.isrcNext = n + 1; });
    return { ok: true, code };
  }
  const rel = catalogReleases.find((r) => r.id === id);
  if (!rel) return fail(404, 'not_found', 'No such release.');
  if ((s.upcs[id] !== undefined ? s.upcs[id] : rel.upc)) return fail(409, 'taken', 'This release already has a UPC.');
  if (!s.gs1Prefix) return fail(409, 'not_set', 'Set your GS1 company prefix in Settings first.');
  const used = new Set(catalogReleases.map((r) => (s.upcs[r.id] !== undefined ? s.upcs[r.id] : r.upc)).filter(Boolean));
  let n = s.upcNext; let code = '';
  for (; n <= gs1Capacity(s.gs1Prefix); n++) { code = upcFor(s.gs1Prefix, n); if (!used.has(code)) break; }
  if (n > gs1Capacity(s.gs1Prefix)) return fail(409, 'not_set', 'Your GS1 prefix has no numbers left.');
  await write((st) => { st.upcs[id] = code; st.upcNext = n + 1; });
  return { ok: true, code };
}
