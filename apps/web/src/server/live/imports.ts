import 'server-only';
import type { ImportsResponse } from '@breakrecords/contract';
import { importRef, type ImportMonth, type Provider } from '@breakrecords/core/imports';
import { periodLabel } from '@breakrecords/core/statements';
import { withTenant } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The catalog's ISRCs, and whether this exact file was imported before. */
export function liveImportContext(ctx: RequestContext, sha: string): Promise<{ known: Set<string>; duplicate: boolean }> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ isrc: string }[]>`SELECT isrc FROM recordings WHERE isrc IS NOT NULL`;
    const [dup] = await tx`SELECT 1 FROM statement_files WHERE file_sha256 = ${sha}`;
    return { known: new Set(rows.map((r) => r.isrc)), duplicate: !!dup };
  });
}

/**
 * Saves a file as one income statement per month, in one transaction: each statement's lines
 * reconcile to its total (the database checks), catalog ISRCs are matched, the rest wait in
 * the unmatched queue. The same file can't be imported twice.
 */
export function liveImport(ctx: RequestContext, f: { provider: Provider; fileName: string; sha: string; months: ImportMonth[] }): Promise<{ ok: true; refs: string[] } | { ok: false; error: 'duplicate'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    const added = await tx`INSERT INTO statement_files (tenant_id, file_sha256, file_name, provider, imported_by)
      VALUES (${ctx.tenantId}, ${f.sha}, ${f.fileName}, ${f.provider.name}, ${ctx.userId}) ON CONFLICT DO NOTHING`;
    if (!added.count) return { ok: false, error: 'duplicate', message: `${f.fileName} was already imported.` } as const;
    const refs: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const m of f.months) {
      const ref = importRef(f.provider.prefix, m.period, f.sha.slice(0, 6));
      const [st] = await tx<{ id: string }[]>`INSERT INTO income_statements (tenant_id, ref, source, period, received_on, total_cents, provider, file_name, file_sha256, imported_by)
        VALUES (${ctx.tenantId}, ${ref}, ${f.provider.source}, ${m.period}, ${today}, ${m.totalCents}, ${f.provider.name}, ${f.fileName}, ${f.sha}, ${ctx.userId}) RETURNING id`;
      // Lines go in batches; a catalog ISRC is matched on the way in.
      for (let i = 0; i < m.lines.length; i += 500) {
        const chunk = m.lines.slice(i, i + 500).map((l) => ({
          tenant_id: ctx.tenantId, statement_id: st.id, line_no: l.lineNo, title: l.title, isrc: l.isrc, store: l.store, territory: l.territory, units: l.units, amount_cents: l.amountCents,
        }));
        await tx`INSERT INTO income_lines ${tx(chunk)}`;
      }
      await tx`UPDATE income_lines l SET recording_id = r.id FROM recordings r WHERE l.statement_id = ${st.id} AND l.isrc = r.isrc`;
      refs.push(ref);
    }
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-IMP-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'statement.imported', ${f.fileName},
              ${tx.json({ provider: f.provider.name, statements: refs, lines: f.months.reduce((a, m) => a + m.lines.length, 0), cents: f.months.reduce((a, m) => a + m.totalCents, 0) } as never)})`;
    return { ok: true, refs } as const;
  });
}

/** Statements imported from files, newest first. */
export function liveImports(ctx: RequestContext): Promise<ImportsResponse['items']> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<{ ref: string; provider: string; file_name: string; period: Date; lines: number; total: string; matched: number; created_at: Date }[]>`
      SELECT s.ref, s.provider, s.file_name, s.period, s.total_cents AS total, s.created_at,
             (SELECT count(*)::int FROM income_lines l WHERE l.statement_id = s.id) AS lines,
             (SELECT count(*)::int FROM income_lines l WHERE l.statement_id = s.id AND (l.recording_id IS NOT NULL OR l.work_id IS NOT NULL)) AS matched
      FROM income_statements s WHERE s.file_sha256 IS NOT NULL ORDER BY s.created_at DESC, s.period DESC LIMIT 200`;
    return rows.map((r) => ({ ref: r.ref, provider: r.provider, fileName: r.file_name, period: periodLabel(r.period), lines: r.lines, total: Number(r.total), matched: r.matched, imported: day(r.created_at) }));
  });
}
