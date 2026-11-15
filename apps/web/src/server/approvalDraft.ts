import 'server-only';
import { cookies } from 'next/headers';
import type { ApprovalDetail } from '@/data/types';
import { withTenant } from '@breakrecords/db/client';
import { sql } from './db';
import type { RequestContext } from './context';
import { mockSession } from './session';

// The answers on an application card (a grant) are edited on the card before it's approved, so
// what gets approved is exactly what's shown. Only while it's undecided.

export type DraftOutcome = { ok: true } | { ok: false; status: number; error: 'not_found' | 'decided' | 'invalid'; message: string };

/** Checks the new answers against the card: one per field, each within its character limit. */
export function checkDraft(d: ApprovalDetail | null, values: string[]): DraftOutcome {
  if (!d) return { ok: false, status: 404, error: 'not_found', message: 'No such approval.' };
  if (d.body.kind !== 'application') return { ok: false, status: 400, error: 'invalid', message: 'Only an application’s answers are edited on the card.' };
  if (values.length !== d.body.fields.length) return { ok: false, status: 400, error: 'invalid', message: `This application has ${d.body.fields.length} answers.` };
  const over = d.body.fields.findIndex((f, i) => values[i].length > f.limit);
  if (over >= 0) return { ok: false, status: 400, error: 'invalid', message: `${d.body.fields[over].label} is over its ${d.body.fields[over].limit.toLocaleString('en-US')} character limit.` };
  if (values.some((v) => !v.trim())) return { ok: false, status: 400, error: 'invalid', message: 'Every answer needs some text.' };
  return { ok: true };
}

// Sample data: this browser session's edits, by approval.
const g = globalThis as unknown as { __brDrafts?: Map<string, Record<string, string[]>> };
const store = (g.__brDrafts ??= new Map());
export async function mockDraftValues(id: string): Promise<string[] | null> {
  const s = (await cookies()).get('br_mock_session')?.value;
  return (s && store.get(s)?.[id]) || null;
}
export async function mockSaveDraft(id: string, values: string[]): Promise<void> {
  const s = await mockSession();
  store.set(s, { ...(store.get(s) ?? {}), [id]: values });
}

/** Live: writes the answers into the card's frozen detail, and logs it. Refused once decided. */
export function liveSaveDraft(ctx: RequestContext, d: ApprovalDetail, values: string[]): Promise<DraftOutcome> {
  return withTenant(sql, ctx, async (tx) => {
    const [decided] = await tx`SELECT 1 FROM approval_decisions WHERE approval_id = ${d.id}`;
    if (decided) return { ok: false, status: 409, error: 'decided', message: 'This card was already decided, so its answers can’t change.' } as const;
    if (d.body.kind !== 'application') return { ok: false, status: 400, error: 'invalid', message: 'Only an application’s answers are edited on the card.' } as const;
    const fields = d.body.fields.map((f, i) => ({ ...f, value: values[i] }));
    await tx`UPDATE approvals SET detail = jsonb_set(detail, '{body,fields}', ${tx.json(fields as never)}) WHERE id = ${d.id}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-DRF-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'approval_draft.edited', ${d.id}, ${tx.json({ title: d.title })})`;
    return { ok: true } as const;
  });
}
