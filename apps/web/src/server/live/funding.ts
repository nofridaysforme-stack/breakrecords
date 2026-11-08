import 'server-only';
import { toIso } from '@breakrecords/core/dates';
import { fundingCard, type Opportunity } from '@breakrecords/core/funding';
import type { OfferAssumptions } from '@breakrecords/core/offers';
import { dayMonth } from '@breakrecords/core/payouts';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { compareOffers, type Funding, type Offers } from '@/data/api';
import { sql } from '../db';
import type { RequestContext } from '../context';

const n = (v: unknown) => Number(v ?? 0);
type Row = {
  id: string; slug: string; kind: Opportunity['kind']; title: string | null; cash_cents: string; up_to: boolean; repay_total_cents: string | null; share_bp: number | null;
  album: string | null; received_on: Date | null; deadline: Date; buy_back: string | null; fit_bp: number; draft_pct: number | null; approval_id: string | null;
  verified_on: Date; dismissed_at: Date | null; declined_at: Date | null; decision: 'approved' | 'rejected' | null;
};

async function assumptionsIn(tx: Tx): Promise<OfferAssumptions> {
  const [a] = await tx<{ annual_income_cents: string; growth_bp: number; album_annual_income_cents: string; years: number }[]>`SELECT * FROM funding_assumptions`;
  return a ? { annualIncome: n(a.annual_income_cents), growthBp: a.growth_bp, albumAnnualIncome: n(a.album_annual_income_cents), years: a.years }
    : { annualIncome: 0, growthBp: 0, albumAnnualIncome: 0, years: 5 };
}

const rowsIn = (tx: Tx) => tx<Row[]>`
  SELECT f.id, f.slug, f.kind::text AS kind, f.title, f.cash_cents, f.up_to, f.repay_total_cents, f.share_bp, r.title AS album, f.received_on, f.deadline, f.buy_back,
         f.fit_bp, f.draft_pct, f.approval_id, f.verified_on, f.dismissed_at, f.declined_at, d.status::text AS decision
  FROM funding_opportunities f
  LEFT JOIN releases r ON r.id = f.album_release_id
  LEFT JOIN approval_decisions d ON d.tenant_id = f.tenant_id AND d.approval_id = f.approval_id
  ORDER BY (f.kind = 'grant') DESC, f.created_at`;

const toOpportunity = (r: Row): Opportunity => ({
  id: r.slug, kind: r.kind, title: r.title, cash: n(r.cash_cents), upTo: r.up_to, repayTotal: r.repay_total_cents === null ? null : n(r.repay_total_cents),
  shareBp: r.share_bp, album: r.album, deadline: toIso(r.deadline), fitBp: r.fit_bp, draftPct: r.draft_pct, verifiedOn: toIso(r.verified_on), approvalId: r.approval_id,
});

async function fundingIn(tx: Tx): Promise<Funding> {
  const a = await assumptionsIn(tx);
  const today = toIso(new Date());
  const rows = await rowsIn(tx);
  const items = rows.filter((r) => !r.dismissed_at).map((r) => fundingCard(toOpportunity(r), a, today));
  const applications = rows.filter((r) => r.kind === 'grant' && r.approval_id).map((r) => {
    const card = fundingCard(toOpportunity(r), a, today);
    return {
      id: r.approval_id!, title: card.title, amount: card.amount,
      status: r.decision === 'approved' ? 'Approved, ready to submit' : r.decision === 'rejected' ? 'Changes requested' : r.draft_pct === null ? 'Not started' : `Draft ${r.draft_pct}% done`,
      due: dayMonth(r.deadline), agent: 'Funding Scout', href: `/approvals/${r.approval_id}`,
    };
  });
  return { counts: { opportunities: items.length, applications: applications.length, offers: items.filter((i) => i.kind !== 'grant').length }, items, applications };
}

/** Funding (5d): grants and offers that haven't been dismissed, with cards worked out from their terms. */
export function liveFunding(ctx: RequestContext): Promise<Funding> {
  return withTenant(sql, ctx, fundingIn);
}

async function offersIn(tx: Tx, overrides: Partial<OfferAssumptions>): Promise<Offers | null> {
  const a = { ...(await assumptionsIn(tx)), ...overrides };
  const rows = (await rowsIn(tx)).filter((r) => !r.dismissed_at).reverse(); // newest first
  const adv = rows.find((r) => r.kind === 'advance');
  const sal = rows.find((r) => r.kind === 'sale');
  if (!adv || !sal) return null;
  const terms = (r: Row, from: string) => ({ from, received: r.received_on ? dayMonth(r.received_on) : 'Not recorded', open: dayMonth(r.deadline), buyBack: r.buy_back ?? 'None offered' });
  const questions = await tx<{ id: string; text: string; asked_at: Date }[]>`SELECT id, text, asked_at FROM funding_questions ORDER BY asked_at DESC`;
  return compareOffers({ advance: adv.slug, sale: sal.slug }, a,
    { kind: 'advance', cash: n(adv.cash_cents), repayTotal: n(adv.repay_total_cents), shareBp: adv.share_bp! },
    { kind: 'sale', cash: n(sal.cash_cents), shareBp: sal.share_bp!, album: sal.album ?? '' },
    { advance: terms(adv, 'Royalty advance'), sale: terms(sal, 'Partial catalog sale') },
    { declined: !!sal.declined_at, questions: questions.map((q) => ({ id: q.id, text: q.text, asked: dayMonth(q.asked_at) })) });
}

/** The offer comparison (5e) for the newest advance and sale. Null unless the label has one of each. */
export function liveOffers(ctx: RequestContext, overrides: Partial<OfferAssumptions>): Promise<Offers | null> {
  return withTenant(sql, ctx, (tx) => offersIn(tx, overrides));
}

const audit = (tx: Tx, ctx: RequestContext, kind: string, ref: string, data: Record<string, unknown> = {}) =>
  tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
     VALUES (${ctx.tenantId}, ${'AUD-FND-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${ref}, ${tx.json(data as never)})`;

export type FundingWrite<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'not_an_offer'; message: string };

/** Dismiss (or bring back) a card. Funding Scout won't suggest a dismissed one again. */
export function liveDismiss(ctx: RequestContext, slug: string, on: boolean): Promise<FundingWrite<Funding>> {
  return withTenant(sql, ctx, async (tx) => {
    const done = await tx`UPDATE funding_opportunities SET dismissed_at = ${on ? new Date() : null}, dismissed_by = ${on ? ctx.userId : null} WHERE slug = ${slug}`;
    if (!done.count) return { ok: false, status: 404, error: 'not_found', message: 'No such opportunity.' } as const;
    await audit(tx, ctx, on ? 'funding.dismissed' : 'funding.restored', slug);
    return { ok: true, value: await fundingIn(tx) } as const;
  });
}

/** Decline (or undo declining) an offer. Finance Agent drafts the reply; nothing is sent from here. */
export function liveDecline(ctx: RequestContext, slug: string, on: boolean): Promise<FundingWrite<Offers | null>> {
  return withTenant(sql, ctx, async (tx) => {
    const [f] = await tx<{ kind: string }[]>`SELECT kind::text AS kind FROM funding_opportunities WHERE slug = ${slug}`;
    if (!f) return { ok: false, status: 404, error: 'not_found', message: 'No such offer.' } as const;
    if (f.kind === 'grant') return { ok: false, status: 409, error: 'not_an_offer', message: 'A grant isn’t an offer to decline. Dismiss it instead.' } as const;
    await tx`UPDATE funding_opportunities SET declined_at = ${on ? new Date() : null}, declined_by = ${on ? ctx.userId : null} WHERE slug = ${slug}`;
    await audit(tx, ctx, on ? 'funding.declined' : 'funding.undeclined', slug);
    return { ok: true, value: await offersIn(tx, {}) } as const;
  });
}

/** Saves a question for the offerers. Finance Agent drafts the emails for the label to send. */
export function liveAsk(ctx: RequestContext, question: string): Promise<Offers | null> {
  return withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO funding_questions (tenant_id, text, asked_by) VALUES (${ctx.tenantId}, ${question}, ${ctx.userId})`;
    await audit(tx, ctx, 'funding.question', 'offers', { question });
    return offersIn(tx, {});
  });
}
