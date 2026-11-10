import 'server-only';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { gs1Capacity, isGs1Prefix, isIsrc, isIsrcPrefix, isUpc, isrcFor, normalizeIsrc, normalizeIsrcPrefix, normalizeUpc, upcFor } from '@breakrecords/core/codes';
import type { CodesResponse } from '@breakrecords/contract';
import { sql } from '../db';
import type { RequestContext } from '../context';

// ISRCs and UPCs: typed in (checked here), or assigned from the workspace's own prefixes by
// the database (app_assign_isrc, app_assign_upc), which never hands out a code in use.

export type CodeError = { ok: false; status: number; error: 'invalid' | 'not_found' | 'taken' | 'forbidden' | 'not_set'; message: string };
const fail = (status: number, error: CodeError['error'], message: string): CodeError => ({ ok: false, status, error, message });
const audit = (tx: Tx, ctx: RequestContext, kind: string, ref: string, data: object) => tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
  VALUES (${ctx.tenantId}, ${'AUD-COD-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;

async function codesIn(tx: Tx, ctx: RequestContext): Promise<CodesResponse> {
  const [p] = await tx<{ isrc_prefix: string | null; isrc_year: number | null; isrc_next: number; gs1_prefix: string | null; upc_next: string }[]>`SELECT * FROM code_prefixes`;
  const year = new Date().getUTCFullYear();
  const isrcN = p?.isrc_prefix ? (p.isrc_year === year ? p.isrc_next : 1) : null;
  const upcN = p?.gs1_prefix ? Number(p.upc_next) : null;
  return {
    isrcPrefix: p?.isrc_prefix ?? null, gs1Prefix: p?.gs1_prefix ?? null,
    nextIsrc: p?.isrc_prefix && isrcN && isrcN <= 99999 ? isrcFor(p.isrc_prefix, year, isrcN) : null,
    nextUpc: p?.gs1_prefix && upcN && upcN <= gs1Capacity(p.gs1_prefix) ? upcFor(p.gs1_prefix, upcN) : null,
    canChange: ctx.role === 'owner',
  };
}

export function liveCodes(ctx: RequestContext): Promise<CodesResponse> {
  return withTenant(sql, ctx, (tx) => codesIn(tx, ctx));
}

export function liveSetCodePrefixes(ctx: RequestContext, c: { isrcPrefix: string | null; gs1Prefix: string | null }): Promise<{ ok: true; value: CodesResponse } | CodeError> {
  if (ctx.role !== 'owner') return Promise.resolve(fail(403, 'forbidden', 'Only the owners set code prefixes.'));
  const isrc = c.isrcPrefix ? normalizeIsrcPrefix(c.isrcPrefix) : '';
  const gs1 = c.gs1Prefix ? normalizeUpc(c.gs1Prefix) : '';
  if (isrc && !isIsrcPrefix(isrc)) return Promise.resolve(fail(400, 'invalid', 'An ISRC prefix is the country code and your registrant code, like US-NL1.'));
  if (gs1 && !isGs1Prefix(gs1)) return Promise.resolve(fail(400, 'invalid', 'A GS1 company prefix is 6 to 10 digits, as GS1 gave it to you.'));
  return withTenant(sql, ctx, async (tx) => {
    await tx`SELECT app_set_code_prefixes(${isrc}, ${gs1})`;
    await audit(tx, ctx, 'code_prefixes.set', 'codes', { isrc: isrc || null, gs1: gs1 || null });
    return { ok: true, value: await codesIn(tx, ctx) } as const;
  });
}

/** Gives a recording its next ISRC, or a release its next UPC. */
export function liveAssignCode(ctx: RequestContext, kind: 'isrc' | 'upc', slug: string): Promise<{ ok: true; code: string } | CodeError> {
  return withTenant(sql, ctx, async (tx) => {
    try {
      const [{ code }] = kind === 'isrc'
        ? await tx<{ code: string }[]>`SELECT app_assign_isrc(${slug}) AS code`
        : await tx<{ code: string }[]>`SELECT app_assign_upc(${slug}) AS code`;
      await audit(tx, ctx, `${kind}.assigned`, slug, { code });
      return { ok: true, code } as const;
    } catch (e) {
      const code = (e as { code?: string }).code;
      const message = (e as Error).message.replace(/^./, (c) => c.toUpperCase());
      if (code === 'P0002') return fail(404, 'not_found', `${message}.`);
      if (code === '23505') return fail(409, 'taken', `${message}.`);
      if (code === '22023') return fail(409, 'not_set', `${message}.`);
      throw e;
    }
  });
}

/** Sets or clears a recording's ISRC by hand. */
export function liveSetIsrc(tx: Tx, slug: string, value: string | null): Promise<CodeError | null> {
  const isrc = value ? normalizeIsrc(value) : null;
  if (isrc && !isIsrc(isrc)) return Promise.resolve(fail(400, 'invalid', 'An ISRC has 12 characters, like US-NL1-26-00014.'));
  return (async () => {
    if (isrc && (await tx`SELECT 1 FROM recordings WHERE isrc = ${isrc} AND slug <> ${slug}`).length) return fail(409, 'taken', 'Another recording in your catalog already has that ISRC.');
    // A savepoint, so a clash with another workspace's ISRC leaves the transaction usable.
    try { await tx.savepoint((sp) => sp`UPDATE recordings SET isrc = ${isrc} WHERE slug = ${slug}`); }
    catch (e) { if ((e as { code?: string }).code === '23505') return fail(409, 'taken', 'That ISRC is already in use.'); throw e; }
    return null;
  })();
}

/** Sets or clears a release's UPC by hand, checking its check digit. */
export function liveSetUpc(ctx: RequestContext, slug: string, value: string | null): Promise<{ ok: true; upc: string | null } | CodeError> {
  const upc = value ? normalizeUpc(value) : null;
  if (upc && !isUpc(upc)) return Promise.resolve(fail(400, 'invalid', 'That isn’t a valid UPC: it should be 12 digits (or a 13-digit EAN) with a correct last digit.'));
  return withTenant(sql, ctx, async (tx) => {
    try {
      const done = await tx.savepoint((sp) => sp`UPDATE releases SET upc = ${upc} WHERE slug = ${slug}`);
      if (!done.count) return fail(404, 'not_found', 'No such release.');
    } catch (e) { if ((e as { code?: string }).code === '23505') return fail(409, 'taken', 'That UPC is already in use.'); throw e; }
    await audit(tx, ctx, 'release.updated', slug, { upc });
    return { ok: true, upc } as const;
  });
}
