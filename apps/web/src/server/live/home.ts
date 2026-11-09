import 'server-only';
import { toIso, addDays } from '@breakrecords/core/dates';
import { periodLabel } from '@breakrecords/core/statements';
import { withTenant } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';

const n = (v: unknown) => Number(v ?? 0);

export type HomeNumbers = {
  numbers: { income: number; owed: number; recouped: number; cash90: number; unclaimed: number };
  notes: { period: string; income: string; owed: string; owedApprovalId: string | null; recouped: string; cash90: string; unclaimed: string };
};

/**
 * Home's money row, read from the same tables as the money screens so the two always agree:
 * the latest period's income, what's owed in batches waiting on you, what was recouped in the
 * period, unclaimed money found, and a plain forecast: the recent monthly average for 90 days,
 * less every payout due in that time.
 */
export function liveHomeNumbers(ctx: RequestContext): Promise<HomeNumbers> {
  return withTenant(sql, ctx, async (tx) => {
    const today = toIso(new Date());
    const [p] = await tx<{ cur: Date | null; income: string; avg: string | null; sources: number }[]>`
      WITH per AS (SELECT s.period, sum(l.amount_cents) AS cents, count(DISTINCT s.source) AS sources
                   FROM income_lines l JOIN income_statements s ON s.id = l.statement_id GROUP BY s.period)
      SELECT (SELECT max(period) FROM per) AS cur,
             coalesce((SELECT cents FROM per ORDER BY period DESC LIMIT 1), 0) AS income,
             (SELECT avg(cents) FROM (SELECT cents FROM per ORDER BY period DESC LIMIT 3) x) AS avg,
             coalesce((SELECT sources FROM per ORDER BY period DESC LIMIT 1), 0)::int AS sources`;
    const [owed] = await tx<{ cents: string; payees: number; approval: string | null }[]>`
      SELECT coalesce(sum(l.amount_cents), 0) AS cents, count(DISTINCT l.party_id)::int AS payees, min(b.approval_id) AS approval
      FROM payout_batches b JOIN payout_lines l ON l.batch_id = b.id WHERE b.status = 'awaiting' AND l.status = 'included'`;
    const [due] = await tx<{ cents: string }[]>`
      SELECT coalesce(sum(l.amount_cents), 0) AS cents FROM payout_batches b JOIN payout_lines l ON l.batch_id = b.id
      WHERE b.status IN ('awaiting', 'draft') AND l.status = 'included' AND b.pays_on <= ${addDays(today, 90)}`;
    const recouped = p.cur ? await tx<{ title: string; cents: string; done: boolean }[]>`
      SELECT r.title, e.amount_cents AS cents,
             (SELECT sum(e2.amount_cents) FROM recoupment_entries e2 WHERE e2.account_id = a.id)
               >= a.advance_cents + coalesce((SELECT sum(round(c.cost_cents * c.share_bp / 10000.0)) FROM recoupable_costs c WHERE c.account_id = a.id), 0) AS done
      FROM recoupment_entries e JOIN recoupment_accounts a ON a.id = e.account_id JOIN releases r ON r.id = a.release_id
      WHERE e.period = ${p.cur} ORDER BY e.amount_cents DESC` : [];
    const [unc] = await tx<{ cents: string; sources: number }[]>`
      SELECT coalesce(sum(amount_cents), 0) AS cents, count(DISTINCT source)::int AS sources FROM unclaimed_royalties WHERE status IN ('found', 'claim_prepared', 'claimed')`;

    const month = p.cur ? periodLabel(p.cur).split(' ')[0].slice(0, 3) : 'No data';
    const finished = recouped.filter((r) => r.done).map((r) => r.title);
    return {
      numbers: {
        income: n(p.income), owed: n(owed.cents), recouped: recouped.reduce((a, r) => a + n(r.cents), 0),
        cash90: Math.round(n(p.avg) * 3) - n(due.cents), unclaimed: n(unc.cents),
      },
      notes: {
        period: month,
        income: p.cur ? `${month}, ${p.sources} source${p.sources === 1 ? '' : 's'}` : 'No statements yet',
        owed: owed.payees ? `${owed.payees} payee${owed.payees === 1 ? '' : 's'}` : 'Nothing waiting', owedApprovalId: owed.payees ? owed.approval : null,
        recouped: finished.length ? `${finished.join(' and ')} fully recouped` : recouped.length ? `${recouped.length} release${recouped.length === 1 ? '' : 's'} recouping` : 'Nothing this period',
        cash90: 'Recent average, less payouts due',
        unclaimed: unc.sources ? `${unc.sources} source${unc.sources === 1 ? '' : 's'} to claim` : 'Nothing found',
      },
    };
  });
}
