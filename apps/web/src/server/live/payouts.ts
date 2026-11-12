import 'server-only';
import { heldLines } from './reserves';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { formatMoney } from '@breakrecords/core/money';
import { formatPercent } from '@breakrecords/core/percent';
import { dayMonth, dayMonthYear, monthYear, recoupment as recoup, shareBasis, shareTerms, signPrompt, taxState } from '@breakrecords/core/payouts';
import { periodLabel } from '@breakrecords/core/statements';
import { taxTreatment, type MissingFormPolicy } from '@breakrecords/core/tax';
import { SPLIT_ROLES, type SplitRole } from '@breakrecords/core/splitVersions';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { Payee, Payouts, Recoup } from '@/data/money';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Kind = 'tax_form' | 'bank_details';
const n = (v: unknown) => Number(v ?? 0);
const today = () => new Date();
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
type TaxRow = { tax_form: string | null; tax_expires_on: Date | null; backup_withholding: boolean; treaty_country: string | null; treaty_article: string | null; treaty_rate_bp: number | null };
/** How a payment to this payee is taxed today, in words. */
export const withholdingLabel = (y: TaxRow, policy: MissingFormPolicy) => taxTreatment({
  form: y.tax_form, expiresOn: iso(y.tax_expires_on), backupWithholding: y.backup_withholding,
  treaty: y.treaty_country ? { country: y.treaty_country, article: y.treaty_article ?? '', rateBp: y.treaty_rate_bp ?? 0 } : null,
}, today().toISOString().slice(0, 10), policy).label;
const first = (name: string) => name.split(' ')[0];

async function payoutsIn(tx: Tx): Promise<Payouts> {
  const [policy] = await tx<{ minimum_cents: string; missing_form_policy: MissingFormPolicy }[]>`SELECT minimum_cents, missing_form_policy FROM payout_policies`;
  const missingFormPolicy: MissingFormPolicy = policy?.missing_form_policy ?? 'hold';
  const held = await heldLines(tx);
  const batches = await tx<{ id: string; slug: string; name: string; status: Payouts['batches'][number]['status']; approval_id: string | null; pays_on: Date; sent_at: Date | null;
    total: string; payees: number; carried: number; failed: { slug: string; name: string; reason: string } | null }[]>`
    SELECT b.id, b.slug, b.name, b.status::text AS status, b.approval_id, b.pays_on, b.sent_at,
           coalesce(sum(l.amount_cents) FILTER (WHERE l.status IN ('included', 'paid', 'failed')), 0) AS total,
           count(DISTINCT l.party_id) FILTER (WHERE l.status IN ('included', 'paid', 'failed'))::int AS payees,
           count(*) FILTER (WHERE l.status = 'carried')::int AS carried,
           (SELECT json_build_object('slug', p.slug, 'name', p.name, 'reason', fl.failure) FROM payout_lines fl JOIN parties p ON p.id = fl.party_id
              WHERE fl.batch_id = b.id AND fl.status = 'failed' ORDER BY p.name LIMIT 1) AS failed
    FROM payout_batches b LEFT JOIN payout_lines l ON l.batch_id = b.id
    GROUP BY b.id ORDER BY (b.status = 'awaiting') DESC, (b.status = 'draft') DESC, b.period DESC, b.pays_on DESC`;
  const payees = await tx<({ slug: string; name: string } & TaxRow)[]>`
    SELECT p.slug, p.name, y.tax_form, y.tax_expires_on, y.backup_withholding, y.treaty_country, y.treaty_article, y.treaty_rate_bp FROM payees y JOIN parties p ON p.id = y.party_id ORDER BY y.created_at, p.name`;
  const carried = await tx<{ name: string; role: string; amount_cents: string }[]>`
    SELECT p.name, l.role, l.amount_cents FROM payout_lines l JOIN parties p ON p.id = l.party_id JOIN payout_batches b ON b.id = l.batch_id
    WHERE l.status = 'carried' AND b.status IN ('awaiting', 'draft') ORDER BY b.pays_on, l.amount_cents DESC`;
  const requests = await tx<{ slug: string; kind: Kind }[]>`
    SELECT p.slug, r.kind::text AS kind FROM payee_requests r JOIN parties p ON p.id = r.party_id WHERE r.done_at IS NULL ORDER BY r.requested_at`;

  const note = (b: (typeof batches)[number]) =>
    b.status === 'failed' && b.failed ? `${b.failed.name}, ${b.failed.reason}`
    : b.status === 'sent' ? `Sent ${dayMonth(b.sent_at!)}`
    : b.status === 'draft' ? `Opens ${dayMonth(b.pays_on)}`
    : b.carried ? `${b.carried} carried forward` : `Pays ${dayMonth(b.pays_on)}`;
  return {
    minimum: policy ? n(policy.minimum_cents) : 2500,
    missingFormPolicy,
    batches: batches.map((b) => ({
      id: b.slug, name: b.name, payees: b.payees, total: n(b.total), status: b.status, note: note(b),
      ...(b.approval_id ? { approvalId: b.approval_id } : {}),
      ...((h) => (h ? { held: h } : {}))(held.filter((l) => l.batchId === b.id).reduce((a, l) => a + l.held, 0)),
      ...(b.status === 'failed' && b.failed ? { failed: { payeeId: b.failed.slug, name: b.failed.name, reason: b.failed.reason } } : {}),
    })),
    taxForms: payees.map((y) => {
      const t = taxState(y.tax_form, y.tax_expires_on, today());
      return { payeeId: y.slug, name: y.name, form: y.tax_form ?? 'None', status: t.status, label: t.label, withholding: withholdingLabel(y, missingFormPolicy),
        ...(t.status === 'ok' ? {} : { fix: y.tax_form && t.status === 'expiring' ? 'Request new' : 'Request form' }) };
    }),
    carryForward: carried.map((c) => ({ name: c.name, role: c.role, amount: n(c.amount_cents) })),
    requests: requests.map((r) => ({ payeeId: r.slug, kind: r.kind })),
  };
}

/** Payouts (4d) for the signed-in tenant. Totals and notes are computed from the lines. */
export function livePayouts(ctx: RequestContext): Promise<Payouts> {
  return withTenant(sql, ctx, payoutsIn);
}

export type WriteOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'already_requested'; message: string };

/** Records a request to a payee. The payout provider sends it (Stage 3); nothing is emailed from here. */
export function liveRequestFromPayee(ctx: RequestContext, payeeId: string, kind: Kind): Promise<WriteOutcome<Payouts>> {
  return withTenant(sql, ctx, async (tx) => {
    const [y] = await tx<{ party_id: string }[]>`SELECT y.party_id FROM payees y JOIN parties p ON p.id = y.party_id WHERE p.slug = ${payeeId}`;
    if (!y) return { ok: false, status: 404, error: 'not_found', message: 'No such payee.' } as const;
    const made = await tx`INSERT INTO payee_requests (tenant_id, party_id, kind, requested_by) VALUES (${ctx.tenantId}, ${y.party_id}, ${kind}, ${ctx.userId})
      ON CONFLICT (party_id, kind) WHERE done_at IS NULL DO NOTHING`;
    if (!made.count) return { ok: false, status: 409, error: 'already_requested', message: 'Already requested. Waiting on them.' } as const;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-PAY-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'payee_request.created', ${payeeId}, ${tx.json({ kind })})`;
    return { ok: true, value: await payoutsIn(tx) } as const;
  });
}

/** What happens to a payee with no valid tax form: hold their payout, or pay with 24% backup withholding. */
export function liveSetMissingFormPolicy(ctx: RequestContext, policy: MissingFormPolicy): Promise<Payouts> {
  return withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO payout_policies (tenant_id) VALUES (${ctx.tenantId}) ON CONFLICT DO NOTHING`;
    await tx`UPDATE payout_policies SET missing_form_policy = ${policy}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-PAY-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'payout_policy.changed', 'missing_form_policy', ${tx.json({ policy })})`;
    return payoutsIn(tx);
  });
}

/** A payee certifies their own tax form in the portal. The database checks it is them. */
export async function liveSubmitTaxForm(ctx: RequestContext, c: { form: 'W-9' | 'W-8BEN' | 'W-8BEN-E'; legalName: string; tinLast4?: string; country?: string; treaty?: { article: string; rateBp: number }; signature: string }): Promise<Payee | null> {
  await withTenant(sql, ctx, async (tx) => {
    await tx`SELECT app_submit_tax_form(${c.form}, ${c.legalName}, ${c.tinLast4 ?? null}, ${c.signature}, ${c.country ?? null},
      ${c.treaty ? c.country ?? null : null}, ${c.treaty?.article ?? null}, ${c.treaty?.rateBp ?? null}::integer, ${today().toISOString().slice(0, 10)}::date)`;
  });
  return livePayee(ctx, null);
}

async function recoupmentIn(tx: Tx): Promise<Recoup[]> {
  const rows = await tx<{ id: string; slug: string; title: string; kind: string; artist: string; advance_cents: string; projected_on: Date | null;
    costs: { category: string; cost: number; shareBp: number }[]; entries: { period: string; amount: number }[] }[]>`
    SELECT a.id, r.slug, r.title, r.kind::text AS kind, p.name AS artist, a.advance_cents, a.projected_on,
           coalesce((SELECT json_agg(json_build_object('category', c.category, 'cost', c.cost_cents, 'shareBp', c.share_bp) ORDER BY c.created_at)
             FROM recoupable_costs c WHERE c.account_id = a.id), '[]') AS costs,
           coalesce((SELECT json_agg(json_build_object('period', e.period, 'amount', e.amount_cents) ORDER BY e.period)
             FROM recoupment_entries e WHERE e.account_id = a.id), '[]') AS entries
    FROM recoupment_accounts a JOIN releases r ON r.id = a.release_id JOIN parties p ON p.id = r.artist_id
    ORDER BY a.created_at`;
  return rows.map((r) => {
    const advance = n(r.advance_cents);
    const costs = r.costs.map((c) => ({ category: c.category, cost: n(c.cost), shareBp: c.shareBp }));
    const sum = recoup(advance, costs, r.entries.map((e) => ({ period: e.period, amount: n(e.amount) })));
    const funding = advance ? `${formatMoney(advance, { wholeIfRound: true })} advance` : `label-funded ${r.kind === 'ep' ? 'EP' : r.kind}`;
    return {
      id: r.slug, title: r.title, artist: `${r.artist} · ${funding}`, advance, recouped: sum.recouped, costs,
      ...(sum.recoupedIn ? { recoupedIn: monthYear(sum.recoupedIn) } : r.projected_on ? { projected: monthYear(r.projected_on) } : {}),
    };
  });
}

/** Recoupment (4e): each release's advance, costs and what has been taken back, from the ledger. */
export function liveRecoupment(ctx: RequestContext): Promise<Recoup[]> {
  return withTenant(sql, ctx, recoupmentIn);
}

export function liveAddCost(ctx: RequestContext, c: { releaseId: string; category: string; cost: number; shareBp: number }): Promise<WriteOutcome<Recoup[]>> {
  return withTenant(sql, ctx, async (tx) => {
    const [a] = await tx<{ id: string }[]>`SELECT a.id FROM recoupment_accounts a JOIN releases r ON r.id = a.release_id WHERE r.slug = ${c.releaseId}`;
    if (!a) return { ok: false, status: 404, error: 'not_found', message: 'That release has no recoupment account.' } as const;
    await tx`INSERT INTO recoupable_costs (tenant_id, account_id, category, cost_cents, share_bp, added_by)
      VALUES (${ctx.tenantId}, ${a.id}, ${c.category}, ${c.cost}, ${c.shareBp}, ${ctx.userId})`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-RCP-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'recoupable_cost.added', ${c.releaseId},
              ${tx.json({ category: c.category, cost: c.cost, shareBp: c.shareBp })})`;
    return { ok: true, value: await recoupmentIn(tx) } as const;
  });
}

type SplitRow = { node_id: string; node_slug: string; version: number; status: string; terms: DealTerms; role: SplitRole; signed_at: Date | null };

/** Labels from a node up to (not including) the label at the top: ["Kesi Vale", "Glasshouse", "Recording income"]. */
async function pathOf(tx: Tx, nodeId: string): Promise<string[]> {
  const rows = await tx<{ label: string }[]>`
    WITH RECURSIVE up AS (SELECT id, label, parent_id, 0 AS depth FROM split_nodes WHERE id = ${nodeId}
      UNION ALL SELECT n.id, n.label, n.parent_id, up.depth + 1 FROM split_nodes n JOIN up ON n.id = up.parent_id)
    SELECT label FROM up WHERE parent_id IS NOT NULL ORDER BY depth DESC`;
  return rows.map((r) => r.label.replace(/\s*\(.*\)$/, ''));
}

/**
 * One payee's portal (4f), from their own rows: statements, payout lines, splits and songs.
 * A payee gets only themselves (`slug` must be theirs or null). The label's owner and team can
 * open any payee; with no slug, the first one.
 */
export function livePayee(ctx: RequestContext, slug: string | null): Promise<Payee | null> {
  return withTenant(sql, ctx, async (tx) => {
    const [y] = await tx<({ party_id: string; slug: string; name: string; bank_last4: string | null; bank_name: string | null;
      opening_earned_cents: string; opening_paid_cents: string } & TaxRow)[]>`
      SELECT y.party_id, p.slug, p.name, y.tax_form, y.tax_expires_on, y.backup_withholding, y.treaty_country, y.treaty_article, y.treaty_rate_bp, y.bank_last4, y.bank_name, y.opening_earned_cents, y.opening_paid_cents
      FROM payees y JOIN parties p ON p.id = y.party_id
      WHERE (${ctx.role === 'payee'} AND y.party_id = app_party() AND (${slug}::text IS NULL OR p.slug = ${slug}))
         OR (${ctx.role !== 'payee'} AND (${slug}::text IS NULL OR p.slug = ${slug}))
      ORDER BY y.created_at LIMIT 1`;
    if (!y) return null;

    const statements = await tx<{ ref: string; net_cents: string }[]>`SELECT ref, net_cents FROM payee_statements WHERE party_id = ${y.party_id} ORDER BY period DESC, ref`;
    const [paid] = await tx<{ cents: string }[]>`SELECT coalesce(sum(amount_cents), 0) AS cents FROM payout_lines WHERE party_id = ${y.party_id} AND status = 'paid'`;
    const [next] = await tx<{ amount_cents: string; pays_on: Date; batch: string; release: string | null; period: Date | null; terms: DealTerms | null; role: SplitRole | null }[]>`
      SELECT l.amount_cents, b.pays_on, b.name AS batch, rl.title AS release, s.period, v.terms, sp.role::text AS role
      FROM payout_lines l JOIN payout_batches b ON b.id = l.batch_id
      LEFT JOIN payee_statements s ON s.id = l.statement_id
      LEFT JOIN releases rl ON rl.id = s.release_id
      LEFT JOIN split_versions v ON v.id = s.version_id
      LEFT JOIN split_parties sp ON sp.version_id = v.id AND sp.party_id = l.party_id
      WHERE l.party_id = ${y.party_id} AND l.status = 'included' AND b.status IN ('awaiting', 'draft')
      ORDER BY b.pays_on LIMIT 1`;

    const splits = await tx<SplitRow[]>`
      SELECT v.node_id, (SELECT n.slug FROM split_nodes n WHERE n.id = v.node_id) AS node_slug, v.version, v.status::text AS status, v.terms, sp.role::text AS role, sp.signed_at
      FROM split_parties sp JOIN split_versions v ON v.id = sp.version_id
      WHERE sp.party_id = ${y.party_id} AND v.status IN ('in_effect', 'sent', 'draft') ORDER BY v.node_id, v.version`;
    const songs = await tx<{ title: string; slug: string; share_bp: number; confirmed: boolean }[]>`
      SELECT w.title, w.slug, ww.share_bp, ww.confirmed FROM work_writers ww JOIN works w ON w.id = ww.work_id WHERE ww.party_id = ${y.party_id} ORDER BY w.created_at`;

    const rows: Payee['splits'] = [];
    let prompt: Payee['signPrompt'] = { title: 'Nothing to sign', text: 'Every split you’re on is signed.' };
    for (const nodeId of [...new Set(splits.map((s) => s.node_id))]) {
      const path = await pathOf(tx, nodeId);
      const title = path.length > 1 ? path[path.length - 2] : path[0] ?? 'Split';
      const meta = path.length > 2 ? path[path.length - 3] : '';
      const current = splits.find((s) => s.node_id === nodeId && s.status === 'in_effect');
      const open = splits.find((s) => s.node_id === nodeId && s.status !== 'in_effect');
      if (current) rows.push({ title, meta, terms: shareTerms(current.role, current.terms), status: 'signed', note: `signed v${current.version}` });
      if (open) {
        // The 4f sample's v5 keeps its own sign page; any other split is signed right here.
        const here = open.status === 'sent' && !open.signed_at && open.node_slug !== 'gh-rec';
        rows.push({ title, meta: `v${open.version} ${open.status === 'draft' ? 'draft' : 'sent'}`, terms: here ? shareTerms(open.role, open.terms) : '', status: open.signed_at ? 'signed' : 'waiting',
          note: open.signed_at ? `signed v${open.version}` : 'Waiting for you to sign', ...(here ? { sign: { node: open.node_slug, role: open.role } } : { v5: true }) });
        if (current && !open.signed_at) {
          const names = await tx<{ role: SplitRole; name: string }[]>`
            SELECT sp.role::text AS role, p.name FROM split_parties sp JOIN split_versions v ON v.id = sp.version_id JOIN parties p ON p.id = sp.party_id
            WHERE v.node_id = ${nodeId} AND v.version = ${current.version}`;
          const firsts = Object.fromEntries(SPLIT_ROLES.map((r) => [r, first(names.find((x) => x.role === r)?.name ?? '')])) as Record<SplitRole, string>;
          prompt = { title: `${title} split v${open.version} needs your signature`, text: signPrompt(open.role, current.terms, open.terms, firsts) };
        }
      }
    }
    for (const s of songs) rows.push({ title: `${s.title} (song)`, meta: 'writer', terms: formatPercent(s.share_bp), status: s.confirmed ? 'signed' : 'waiting', note: s.confirmed ? 'signed' : 'Not signed yet', ...(s.confirmed ? {} : { songId: s.slug }) });

    const t = taxState(y.tax_form, y.tax_expires_on, today());
    const label = ctx.tenantName;
    return {
      id: y.slug, first: first(y.name), name: y.name, label, labelShort: label.split(' ')[0],
      earned: n(y.opening_earned_cents) + statements.reduce((a, s) => a + n(s.net_cents), 0),
      paid: n(y.opening_paid_cents) + n(paid.cents),
      next: next
        ? { amount: n(next.amount_cents), date: dayMonth(next.pays_on),
            from: next.release && next.period ? `From ${next.release}, ${periodLabel(next.period).split(' ')[0]}.${next.role && next.terms ? ` ${shareBasis(next.role, next.terms)}` : ''}` : `From the ${next.batch} batch.` }
        : { amount: 0, date: 'Not scheduled', from: 'Nothing is waiting to be paid.' },
      tax: { ok: t.status === 'ok', label: y.tax_form ? `${y.tax_form} ${t.status === 'ok' ? 'on file' : t.label.toLowerCase()}` : 'No tax form on file', form: y.tax_form ?? 'None',
        expires: y.tax_expires_on ? `Expires ${dayMonthYear(y.tax_expires_on)}` : 'No expiry',
        withholding: withholdingLabel(y, (await tx<{ p: MissingFormPolicy }[]>`SELECT missing_form_policy AS p FROM payout_policies`)[0]?.p ?? 'hold'),
        canSubmit: ctx.role === 'payee' },
      bank: y.bank_last4 ? { last4: y.bank_last4, name: y.bank_name ?? 'Account' } : null,
      statementIds: statements.map((s) => s.ref),
      splits: rows,
      signPrompt: prompt,
    };
  });
}
