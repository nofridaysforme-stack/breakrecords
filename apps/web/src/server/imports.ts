import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import type { ImportPreviewResponse, ImportsResponse } from '@breakrecords/contract';
import { guessMapping, importRef, parseDelimited, PROVIDERS, readStatement, type Mapping, type Provider } from '@breakrecords/core/imports';
import { periodLabel } from '@breakrecords/core/statements';
import { recordings } from '@/data/ops';
import { TODAY } from '@/data/fixtures';
import type { RequestContext } from './context';
import { mockSession } from './session';

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const providerOf = (id: string): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS.at(-1)!;

// Sample-data mode: files imported this browser session (they don't change the sample's royalties).
type Item = ImportsResponse['items'][number];
const g = globalThis as unknown as { __brImports?: Map<string, { shas: string[]; items: Item[] }> };
const store = (g.__brImports ??= new Map());
async function mockState() {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || { shas: [], items: [] };
}

/** What a file would import: the mapping (guessed if not given), one statement per month, and what was left out. */
export async function previewImport(ctx: RequestContext | null, c: { provider: string; fileName: string; text: string; mapping?: Mapping }): Promise<{ preview: ImportPreviewResponse; read: ReturnType<typeof readStatement> }> {
  const provider = providerOf(c.provider);
  const headers = parseDelimited(c.text.slice(0, 20_000))[0] ?? [];
  const mapping = c.mapping ?? guessMapping(headers);
  const sha = sha256(c.text);
  const { known, duplicate } = ctx
    ? await (await import('./live/imports')).liveImportContext(ctx, sha)
    : { known: new Set(recordings.map((r) => r.isrc).filter(Boolean) as string[]), duplicate: (await mockState()).shas.includes(sha) };
  const read = readStatement(c.text, mapping, known);
  return {
    read,
    preview: {
      provider: { id: provider.id, name: provider.name }, headers, mapping, missing: read.missing, rows: read.rows, duplicate,
      months: read.months.map((m) => ({ period: m.period, label: periodLabel(new Date(`${m.period}T00:00:00Z`)), lines: m.lines.length, total: m.totalCents, matched: m.matched, unmatched: m.unmatched, unmatchedTotal: m.unmatchedCents })),
      problems: read.problems.slice(0, 50),
      sample: read.months.flatMap((m) => m.lines).slice(0, 8).map((l) => ({ title: l.title, isrc: l.isrc, store: l.store, amount: l.amountCents, matched: l.matched })),
    },
  };
}

/** Imports a file as previewed. Refused if a required column isn't mapped, nothing is readable, or it was imported before. */
export async function runImport(ctx: RequestContext | null, c: { provider: string; fileName: string; text: string; mapping: Mapping }):
  Promise<{ ok: true; refs: string[] } | { ok: false; status: number; error: 'not_mapped' | 'nothing_to_import' | 'duplicate'; message: string }> {
  const { read } = await previewImport(ctx, c);
  if (read.missing.length) return { ok: false, status: 400, error: 'not_mapped', message: `Choose the column for: ${read.missing.map((m) => ({ title: 'track title', amount: 'amount earned', period: 'month' } as Record<string, string>)[m] ?? m).join(', ')}.` };
  if (!read.months.length) return { ok: false, status: 400, error: 'nothing_to_import', message: 'No row in this file could be read. Check the columns.' };
  const provider = providerOf(c.provider);
  const sha = sha256(c.text);
  if (ctx) {
    const out = await (await import('./live/imports')).liveImport(ctx, { provider, fileName: c.fileName, sha, months: read.months });
    return out.ok ? out : { ok: false, status: 409, error: out.error, message: out.message };
  }
  const st = await mockState();
  if (st.shas.includes(sha)) return { ok: false, status: 409, error: 'duplicate', message: `${c.fileName} was already imported.` };
  const id = await mockSession();
  const items: Item[] = read.months.map((m) => ({ ref: importRef(provider.prefix, m.period, sha.slice(0, 6)), provider: provider.name, fileName: c.fileName,
    period: periodLabel(new Date(`${m.period}T00:00:00Z`)), lines: m.lines.length, total: m.totalCents, matched: m.matched, imported: TODAY.label.replace(/^\w+, /, '') + ', 2026' }));
  store.set(id, { shas: [...st.shas, sha], items: [...items.reverse(), ...st.items] });
  return { ok: true, refs: items.map((i) => i.ref) };
}

export async function listImports(ctx: RequestContext | null): Promise<ImportsResponse> {
  const providers = PROVIDERS.map((p) => ({ id: p.id, name: p.name }));
  if (ctx) return { providers, items: await (await import('./live/imports')).liveImports(ctx) };
  return { providers, items: (await mockState()).items };
}
