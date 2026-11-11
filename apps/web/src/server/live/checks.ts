import 'server-only';
import type { ApprovalFacts, FilingFacts, PayoutFacts } from '@breakrecords/core/checks';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { w8ExpiresOn } from '@breakrecords/core/payouts';
import type { Tx } from '@breakrecords/db/client';

// Gathers what the approval checks read, for every agent-prepared card in this tenant, from
// the tables themselves (never from what the card says about itself). Runs inside the
// request's tenant transaction, so row-level security applies.

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const iso = (d: Date | string | null) => (d == null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Today in UTC, as the rules see it. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

async function payoutFacts(tx: Tx, batchId: string): Promise<PayoutFacts> {
  const [b] = await tx<{ period: string; period_end: string; pays_on: string; minimum: string | null }[]>`
    SELECT to_char(b.period, 'YYYY-MM-DD') AS period, to_char((b.period + interval '1 month - 1 day')::date, 'YYYY-MM-DD') AS period_end,
           to_char(b.pays_on, 'YYYY-MM-DD') AS pays_on, (SELECT minimum_cents FROM payout_policies) AS minimum
    FROM payout_batches b WHERE b.id = ${batchId}`;
  const lines = await tx<{
    party_id: string; name: string; role: string; amount: string; withheld: string; status: string; tax_form: string | null; tax_expires_on: Date | null; tax_signed_on: Date | null;
    treaty: boolean; bank: string | null; last_failed: boolean; stmt_version: string | null; stmt_net: string | null;
  }[]>`
    SELECT l.party_id, p.name, l.role, l.amount_cents AS amount, l.withheld_cents AS withheld, l.status::text, y.tax_form, y.tax_expires_on, y.tax_signed_on,
      y.treaty_country IS NOT NULL AS treaty, y.bank_last4 AS bank,
      coalesce((SELECT pl.status = 'failed' FROM payout_lines pl JOIN payout_batches pb ON pb.id = pl.batch_id
                WHERE pl.party_id = l.party_id AND pb.period < ${b.period}::date ORDER BY pb.period DESC LIMIT 1), false) AS last_failed,
      (SELECT s.version_id FROM payee_statements s WHERE s.id = l.statement_id) AS stmt_version,
      (SELECT s.net_cents FROM payee_statements s WHERE s.id = l.statement_id) AS stmt_net
    FROM payout_lines l JOIN parties p ON p.id = l.party_id LEFT JOIN payees y ON y.party_id = l.party_id
    WHERE l.batch_id = ${batchId} ORDER BY l.amount_cents DESC`;
  // Split versions in effect for the period, fully signed, and who is on each.
  const splits = await tx<{ version_id: string; node: string; version: number; terms: DealTerms; party_id: string; role: 'producer' | 'label' | 'artist' | 'feature' }[]>`
    SELECT v.id AS version_id, n.slug AS node, v.version, v.terms, sp.party_id, sp.role::text AS role
    FROM split_versions v JOIN split_nodes n ON n.id = v.node_id JOIN split_parties sp ON sp.version_id = v.id
    WHERE v.status IN ('in_effect', 'superseded') AND v.effective_from <= ${b.period_end}::date
      AND NOT EXISTS (SELECT 1 FROM split_versions later WHERE later.node_id = v.node_id AND later.status IN ('in_effect', 'superseded')
                        AND later.effective_from > v.effective_from AND later.effective_from <= ${b.period_end}::date)
      AND NOT EXISTS (SELECT 1 FROM split_parties x WHERE x.version_id = v.id AND x.signed_at IS NULL)`;
  const agreements = await tx<{ party_id: string; party: string; name: string; complete: boolean }[]>`
    SELECT ap.party_id, p.name AS party, a.name, NOT EXISTS (SELECT 1 FROM agreement_parties x WHERE x.agreement_id = a.id AND x.signed_at IS NULL) AS complete
    FROM agreements a JOIN agreement_parties ap ON ap.agreement_id = a.id JOIN parties p ON p.id = ap.party_id`;
  const income = await tx<{ recording_id: string; title: string; isrc: string | null; released_on: Date | null; amount: string }[]>`
    SELECT r.id AS recording_id, r.title, r.isrc,
      (SELECT min(rel.release_date) FROM release_tracks rt JOIN releases rel ON rel.id = rt.release_id WHERE rt.recording_id = r.id) AS released_on,
      sum(il.amount_cents) AS amount
    FROM income_lines il JOIN income_statements s ON s.id = il.statement_id JOIN recordings r ON r.id = il.recording_id
    WHERE s.period = ${b.period}::date GROUP BY r.id, r.title, r.isrc HAVING sum(il.amount_cents) <> 0 ORDER BY sum(il.amount_cents) DESC`;
  const flags = await tx<{ recording_id: string; note: string }[]>`SELECT recording_id, note FROM audit_flags WHERE resolved_at IS NULL`;
  const titles = new Map(income.map((i) => [i.recording_id, i.title]));

  return {
    kind: 'payout', periodEnd: b.period_end, paysOn: b.pays_on, minimumCents: Number(b.minimum ?? 2500),
    payees: lines.map((l) => {
      const mine = splits.filter((s) => s.party_id === l.party_id);
      const split = mine.find((s) => s.version_id === l.stmt_version) ?? mine[0];
      const theirs = agreements.filter((a) => a.party_id === l.party_id);
      // A band member is paid as the band ("The Low Hours"): the band's signed agreement covers them.
      const asGroup = agreements.some((a) => a.complete && a.party === l.role);
      const w8 = !!l.tax_form?.startsWith('W-8');
      return {
        name: l.name, amountCents: Number(l.amount), status: l.status === 'carried' ? 'carried' : 'included',
        covered: !!split || asGroup || theirs.some((a) => a.complete),
        pendingAgreements: theirs.filter((a) => !a.complete).map((a) => lower(a.name)),
        taxForm: l.tax_form, withheldCents: Number(l.withheld), treaty: l.treaty,
        // A W-9 never expires; a W-8's expiry is worked out from when it was signed.
        taxExpiresOn: w8 ? iso(l.tax_expires_on) ?? (l.tax_signed_on ? w8ExpiresOn(l.tax_signed_on) : null) : null,
        statementNetCents: l.stmt_net == null ? null : Number(l.stmt_net),
        bankOnFile: !!l.bank, lastFailed: l.last_failed,
        split: split ? { node: split.node, version: split.version, terms: split.terms, role: split.role } : null,
      };
    }),
    income: income.map((i) => ({ recording: i.title, isrc: i.isrc, releasedOn: iso(i.released_on), amountCents: Number(i.amount) })),
    flags: flags.filter((f) => titles.has(f.recording_id)).map((f) => ({ recording: titles.get(f.recording_id)!, note: f.note })),
  };
}

async function filingFacts(tx: Tx, org: string, titles: string[]): Promise<ApprovalFacts> {
  const rows = await tx<{ title: string; name: string | null; share_bp: number | null; pro: string | null; ipi: string | null; confirmed: boolean | null; isrcs: string[] }[]>`
    SELECT w.title, p.name, ww.share_bp, p.pro::text AS pro, p.ipi, ww.confirmed,
      coalesce((SELECT array_agg(r.isrc ORDER BY r.isrc) FROM recordings r WHERE r.work_id = w.id AND r.isrc IS NOT NULL), '{}') AS isrcs
    FROM works w LEFT JOIN work_writers ww ON ww.work_id = w.id LEFT JOIN parties p ON p.id = ww.party_id
    WHERE w.title = ANY(${titles}) ORDER BY w.title, ww.share_bp DESC NULLS LAST, p.name`;
  const works = titles.map((title) => {
    const mine = rows.filter((r) => r.title === title);
    return {
      title, isrcs: mine[0]?.isrcs ?? [],
      writers: mine.filter((r) => r.name).map((r) => ({ name: r.name!, shareBp: r.share_bp ?? 0, pro: r.pro, ipi: r.ipi, signed: !!r.confirmed })),
    };
  });
  const [settings] = await tx<{ publishing_mode: FilingFacts['publishingMode'] }[]>`SELECT publishing_mode FROM label_settings`;
  return { kind: 'filing', org, works, publishingMode: settings?.publishing_mode ?? null };
}

/** Facts for every agent-prepared card, keyed by approval id. Cards without facts have no checks. */
export async function liveFacts(tx: Tx): Promise<Record<string, ApprovalFacts>> {
  const cards = await tx<{ id: string; type: string; detail: { body?: { kind?: string; org?: string; works?: { title: string }[]; fields?: { label: string; value: string; limit: number }[] } } | null }[]>`
    SELECT id, type::text, detail FROM approvals WHERE origin = 'agent' AND executed_at IS NULL`;
  const batches = await tx<{ id: string; approval_id: string }[]>`SELECT id, approval_id FROM payout_batches WHERE approval_id IS NOT NULL AND status NOT IN ('sent', 'failed')`;
  const grants = await tx<{ approval_id: string; deadline: Date; verified_on: Date }[]>`SELECT approval_id, deadline, verified_on FROM funding_opportunities WHERE approval_id IS NOT NULL`;
  const out: Record<string, ApprovalFacts> = {};
  for (const c of cards) {
    const body = c.detail?.body;
    const batch = batches.find((b) => b.approval_id === c.id);
    const grant = grants.find((g) => g.approval_id === c.id);
    if (batch) out[c.id] = await payoutFacts(tx, batch.id);
    else if (grant) out[c.id] = { kind: 'grant', deadline: iso(grant.deadline)!, verifiedOn: iso(grant.verified_on)!, fields: body?.fields ?? [] };
    else if (body?.kind === 'filing' && body.works?.length) out[c.id] = await filingFacts(tx, body.org ?? 'registry', body.works.map((w) => w.title));
    else if (c.type === 'signature') out[c.id] = { kind: 'signature' };
  }
  return out;
}
