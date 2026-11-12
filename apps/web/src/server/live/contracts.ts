import 'server-only';
import { contractsSummary, keyDateLabel, shareTerms, signatures } from '@breakrecords/core/contracts';
import { toIso } from '@breakrecords/core/dates';
import { dayMonth, dayMonthYear } from '@breakrecords/core/payouts';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { Contracts } from '@/data/api';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Row = {
  slug: string; name: string; source: 'template' | 'third_party'; edits: number; reviewed: boolean; terms: string | null;
  key_date: Date | null; key_date_what: string | null; approval_id: string | null; decision: 'approved' | 'rejected' | null; due_on: Date | null;
  tslug: string | null; tname: string | null; tversion: string | null; label_owned: boolean | null;
  parties: { name: string; type: string; signers: number; signed: boolean }[];
  writers: { name: string; bp: number; confirmed: boolean }[] | null;
};

type TemplateRow = { slug: string; name: string; version: string; updated_on: Date; summary: string; clauses: { title: string; text: string }[]; playbook: string[];
  origin: 'starter' | 'own'; reviewed: boolean; fits: boolean; history: { version: string; saved: string }[] };

/**
 * The workspace's templates: its own (copies and templates it brought) and every starter from the
 * Indie SRVCS library it hasn't copied. A copy hides the starter of the same slug.
 */
export async function templatesIn(tx: Tx, kind: string): Promise<Contracts['templates']> {
  const rows = await tx<TemplateRow[]>`
    SELECT slug, name, version, updated_on, summary, clauses, playbook, 'own' AS origin, coalesce(starter_reviewed, true) AS reviewed, true AS fits,
           coalesce((SELECT json_agg(json_build_object('version', v.version, 'saved', to_char(v.saved_at, 'Mon FMDD, YYYY')) ORDER BY v.version_no DESC)
             FROM contract_template_versions v WHERE v.template_id = t.id), '[]') AS history, position
    FROM contract_templates t
    UNION ALL
    SELECT s.slug, s.name, s.version, s.updated_on, s.summary, s.clauses, s.playbook, 'starter', s.reviewed_at IS NOT NULL, NOT (${kind}::tenant_kind = ANY (s.not_for)), '[]'::json, s.position
    FROM starter_templates s WHERE NOT EXISTS (SELECT 1 FROM contract_templates c WHERE c.slug = s.slug OR c.starter_slug = s.slug)
    ORDER BY position, name`;
  return rows.map((t) => ({ id: t.slug, name: t.name, version: t.version, updated: dayMonthYear(t.updated_on), summary: t.summary, clauses: t.clauses, playbook: t.playbook,
    origin: t.origin, reviewed: t.reviewed, fits: t.fits, history: t.history }));
}

async function contractsIn(tx: Tx, labelShort: string, kind: string): Promise<Contracts> {
  const today = toIso(new Date());
  const templates = await templatesIn(tx, kind);
  const [{ staff }] = await tx<{ staff: boolean }[]>`SELECT app_is_platform_admin() AS staff`;
  const rows = await tx<Row[]>`
    SELECT a.slug, a.name, a.source::text AS source, a.edits, a.reviewed, a.terms, a.key_date, a.key_date_what, a.approval_id,
           d.status::text AS decision, ap.due_on,
           t.slug AS tslug, t.name AS tname, t.version AS tversion, t.label_owned,
           coalesce((SELECT json_agg(json_build_object('name', p.name, 'type', p.type, 'signers', x.signers, 'signed', x.signed_at IS NOT NULL) ORDER BY x.position, p.name)
             FROM agreement_parties x JOIN parties p ON p.id = x.party_id WHERE x.agreement_id = a.id), '[]') AS parties,
           (SELECT json_agg(json_build_object('name', p.name, 'bp', ww.share_bp, 'confirmed', ww.confirmed) ORDER BY ww.share_bp DESC, p.name)
             FROM work_writers ww JOIN parties p ON p.id = ww.party_id WHERE ww.work_id = a.work_id) AS writers
    FROM agreements a
    LEFT JOIN contract_templates t ON t.id = a.template_id
    LEFT JOIN approvals ap ON ap.tenant_id = a.tenant_id AND ap.id = a.approval_id
    LEFT JOIN approval_decisions d ON d.tenant_id = a.tenant_id AND d.approval_id = a.approval_id
    ORDER BY a.created_at`;
  const reviews = await tx<{ id: string; file_name: string; status: 'queued' | 'reviewed'; requested_at: Date }[]>`
    SELECT id, file_name, status::text AS status, requested_at FROM contract_reviews ORDER BY requested_at DESC`;

  const contracts = rows.map((a) => {
    const v = a.tversion?.split(' ')[0] ?? '';
    const from = a.source === 'third_party' ? `Third party${a.reviewed ? ' · reviewed' : ''}`
      : `${a.label_owned ? `${labelShort} ${a.tname!.replace(/ agreement$/i, '').toLowerCase()}` : a.tname} ${v}${a.edits ? ` · ${a.edits} edit${a.edits === 1 ? '' : 's'}` : ''}`;
    const approval = !a.approval_id ? 'none' as const : a.decision ?? 'pending' as const;
    const split = a.writers;
    const sig = split
      ? signatures({ approval: 'none', signed: split.filter((w) => w.confirmed).length, of: split.length })
      : signatures({ approval, signed: a.parties.filter((p) => p.signed).reduce((n, p) => n + p.signers, 0), of: a.parties.reduce((n, p) => n + p.signers, 0) });
    const pendingDue = approval === 'pending' && a.due_on;
    const date = pendingDue ? a.due_on : a.key_date;
    return {
      id: a.slug, name: a.name, template: from, ...(a.tslug ? { templateId: a.tslug } : {}),
      parties: split ? split.map((w) => w.name.split(' ')[0]).join(', ')
        : a.parties.map((p) => (p.type === 'group' && p.signers > 1 ? `${p.name} (${p.signers})` : p.name)).join(', '),
      terms: split ? shareTerms(split.map((w) => w.bp)) : a.terms ?? '',
      date: date ? keyDateLabel(date, today) : null, dateWhat: pendingDue ? 'Approval due' : a.key_date_what ?? '',
      ...sig, ...(a.approval_id ? { href: `/approvals/${a.approval_id}` } : {}),
      iso: a.key_date ? toIso(a.key_date) : null, // the summary counts agreement dates, not approval deadlines
    };
  });
  return {
    summary: contractsSummary(contracts.map((c) => ({ sigState: c.sigState, date: c.iso })), today),
    contracts: contracts.map(({ iso: _iso, ...c }) => c),
    templates, staff,
    reviews: reviews.map((r) => ({ id: r.id, fileName: r.file_name, status: r.status, requested: dayMonth(r.requested_at) })),
  };
}

/** Contracts (5b) for the signed-in tenant: signatures, key dates and the summary are worked out from the rows. */
export function liveContracts(ctx: RequestContext): Promise<Contracts> {
  return withTenant(sql, ctx, (tx) => contractsIn(tx, ctx.tenantName.split(' ')[0], ctx.tenantKind));
}

/** Records a contract for Legal Agent to review. Audited; nothing is signed or sent. */
export function liveRequestReview(ctx: RequestContext, fileName: string): Promise<Contracts> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = await tx<{ id: string }[]>`INSERT INTO contract_reviews (tenant_id, file_name, requested_by) VALUES (${ctx.tenantId}, ${fileName}, ${ctx.userId}) RETURNING id`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-CTR-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'contract_review.requested', ${r.id}, ${tx.json({ fileName })})`;
    return contractsIn(tx, ctx.tenantName.split(' ')[0], ctx.tenantKind);
  });
}

export type TemplateOutcome = { ok: true; value: Contracts } | { ok: false; status: number; error: 'not_found' | 'conflict' | 'forbidden'; message: string };
const audit = (tx: Tx, ctx: RequestContext, kind: string, ref: string, data: object) =>
  tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
    VALUES (${ctx.tenantId}, ${'AUD-TPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;
const again = (tx: Tx, ctx: RequestContext) => contractsIn(tx, ctx.tenantName.split(' ')[0], ctx.tenantKind);

/** Makes the workspace's own copy of a starter template, which it can then change. */
export function liveCopyStarter(ctx: RequestContext, slug: string): Promise<TemplateOutcome> {
  return withTenant(sql, ctx, async (tx) => {
    const [own] = await tx`SELECT 1 FROM contract_templates WHERE slug = ${slug} OR starter_slug = ${slug}`;
    if (own) return { ok: false, status: 409, error: 'conflict', message: 'This workspace already has its own copy of this template.' } as const;
    const [st] = await tx<{ slug: string }[]>`
      INSERT INTO contract_templates (tenant_id, slug, name, version, updated_on, summary, clauses, playbook, label_owned, position, starter_slug, starter_reviewed)
      SELECT ${ctx.tenantId}, slug, name, version, current_date, summary, clauses, playbook, label_owned, position, slug, reviewed_at IS NOT NULL
      FROM starter_templates WHERE slug = ${slug} RETURNING slug`;
    if (!st) return { ok: false, status: 404, error: 'not_found', message: 'No such starter template.' } as const;
    await audit(tx, ctx, 'contract_template.copied', slug, {});
    return { ok: true, value: await again(tx, ctx) } as const;
  });
}

/** New wording for one of the workspace's own templates. Saved as a new version; earlier versions are kept. */
export function liveEditTemplate(ctx: RequestContext, slug: string, w: { summary: string; clauses: { title: string; text: string }[]; playbook: string[] }): Promise<TemplateOutcome> {
  return withTenant(sql, ctx, async (tx) => {
    const [t] = await tx<{ id: string }[]>`SELECT id FROM contract_templates WHERE slug = ${slug}`;
    if (!t) {
      const [starter] = await tx`SELECT 1 FROM starter_templates WHERE slug = ${slug}`;
      return starter ? { ok: false, status: 409, error: 'conflict', message: 'Make your own copy first. Starter templates can’t be changed.' } as const
        : { ok: false, status: 404, error: 'not_found', message: 'No such template.' } as const;
    }
    const [v] = await tx<{ version: string }[]>`UPDATE contract_templates SET summary = ${w.summary}, clauses = ${tx.json(w.clauses as never)}, playbook = ${w.playbook}
      WHERE id = ${t.id} RETURNING version`;
    await audit(tx, ctx, 'contract_template.edited', slug, { version: v.version });
    return { ok: true, value: await again(tx, ctx) } as const;
  });
}

/** Indie SRVCS staff record, or withdraw, an attorney's review of a starter template. */
export function liveReviewStarter(ctx: RequestContext, slug: string, reviewed: boolean): Promise<TemplateOutcome> {
  return withTenant(sql, ctx, async (tx) => {
    const [{ staff }] = await tx<{ staff: boolean }[]>`SELECT app_is_platform_admin() AS staff`;
    if (!staff) return { ok: false, status: 403, error: 'forbidden', message: 'Only Indie SRVCS staff record a lawyer’s review.' } as const;
    const [st] = await tx`SELECT 1 FROM starter_templates WHERE slug = ${slug}`;
    if (!st) return { ok: false, status: 404, error: 'not_found', message: 'No such starter template.' } as const;
    await tx`SELECT app_set_starter_reviewed(${slug}, ${reviewed})`;
    await audit(tx, ctx, reviewed ? 'starter_template.reviewed' : 'starter_template.review_withdrawn', slug, {});
    return { ok: true, value: await again(tx, ctx) } as const;
  });
}
