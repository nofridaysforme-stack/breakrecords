import 'server-only';
import { toIso } from '@breakrecords/core/dates';
import { taxState } from '@breakrecords/core/payouts';
import { mainGenre, memberType, openItem, releaseCountdown, type OpenItem } from '@breakrecords/core/roster';
import { withTenant } from '@breakrecords/db/client';
import type { getRoster } from '@/data/api';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { liveContracts } from './contracts';

type Roster = Awaited<ReturnType<typeof getRoster>>;
const n = (v: unknown) => Number(v ?? 0);

/**
 * The roster from the tables other modules keep: genre and releases from the catalog, the
 * agreement and its signatures from contracts, the latest period's income from statement lines,
 * and the one open item from approvals, tax forms and the next release.
 */
export async function liveRoster(ctx: RequestContext): Promise<Roster> {
  const contracts = await liveContracts(ctx);
  return withTenant(sql, ctx, async (tx) => {
    const today = toIso(new Date());
    const rows = await tx<{
      party_id: string; slug: string; name: string; type: string; role: string;
      genres: (string | null)[]; releases: number; members: number | null; agreement: string | null;
    }[]>`
      SELECT m.party_id, p.slug, p.name, p.type::text AS type, m.role,
             coalesce((SELECT array_agg(r.genre) FROM recordings r WHERE r.artist_id = p.id
                        OR EXISTS (SELECT 1 FROM recording_credits c WHERE c.recording_id = r.id AND c.party_id = p.id)), '{}') AS genres,
             (SELECT count(*)::int FROM releases rl WHERE rl.artist_id = p.id) AS releases,
             (SELECT x.signers FROM agreement_parties x WHERE x.party_id = p.id ORDER BY x.signers DESC LIMIT 1) AS members,
             (SELECT a.slug FROM agreement_parties x JOIN agreements a ON a.id = x.agreement_id JOIN contract_templates t ON t.id = a.template_id
                WHERE x.party_id = p.id AND t.label_owned ORDER BY a.created_at LIMIT 1) AS agreement
      FROM roster_members m JOIN parties p ON p.id = m.party_id ORDER BY m.position, p.name`;

    // The latest period's matched income by artist (a song's income goes to its first recording's artist).
    const income = await tx<{ artist_id: string; cents: string }[]>`
      SELECT coalesce(r.artist_id, (SELECT r2.artist_id FROM recordings r2 WHERE r2.work_id = l.work_id ORDER BY r2.created_at LIMIT 1)) AS artist_id,
             sum(l.amount_cents) AS cents
      FROM income_lines l JOIN income_statements s ON s.id = l.statement_id LEFT JOIN recordings r ON r.id = l.recording_id
      WHERE s.period = (SELECT max(period) FROM income_statements) AND (l.recording_id IS NOT NULL OR l.work_id IS NOT NULL)
      GROUP BY 1`;

    // Tax forms that need attention for the artist or anyone who writes their songs.
    const tax = await tx<{ artist_id: string; name: string; tax_form: string | null; tax_expires_on: Date | null }[]>`
      SELECT DISTINCT m.party_id AS artist_id, p.name, y.tax_form, y.tax_expires_on
      FROM roster_members m
      JOIN parties p ON p.id = m.party_id OR p.id IN (
        SELECT ww.party_id FROM work_writers ww JOIN recordings r ON r.work_id = ww.work_id WHERE r.artist_id = m.party_id)
      JOIN payees y ON y.party_id = p.id
      ORDER BY p.name`;

    const next = await tx<{ artist_id: string; slug: string; title: string; on: Date; runbook: boolean }[]>`
      SELECT DISTINCT ON (rl.artist_id) rl.artist_id, rl.slug, rl.title,
             coalesce((SELECT a.new_date FROM approvals a JOIN approval_decisions d ON d.tenant_id = a.tenant_id AND d.approval_id = a.id
                         WHERE a.type = 'plan' AND a.release_id = rl.slug AND d.status = 'approved' ORDER BY d.decided_at DESC LIMIT 1), rl.release_date) AS on,
             EXISTS (SELECT 1 FROM runbook_phases ph WHERE ph.release_id = rl.id) AS runbook
      FROM releases rl WHERE rl.release_date >= ${today}
      ORDER BY rl.artist_id, rl.release_date`;

    return rows.map((m) => {
      const c = m.agreement ? contracts.contracts.find((x) => x.id === m.agreement) : undefined;
      const short = c?.name.split(',')[0];
      const approval: OpenItem | undefined = c?.sigState === 'waiting' && c.href ? { open: `${short} needs your eyes`, href: c.href } : undefined;
      const form = tax.filter((t) => t.artist_id === m.party_id).map((t) => ({ t, s: taxState(t.tax_form, t.tax_expires_on, today) })).find((x) => x.s.status !== 'ok');
      const taxItem: OpenItem | undefined = form
        ? { open: `${form.t.name}’s tax form ${form.s.label === 'Missing' ? 'is missing' : form.s.label.charAt(0).toLowerCase() + form.s.label.slice(1)}`, href: '/money/payouts' }
        : undefined;
      const rel = next.find((r) => r.artist_id === m.party_id);
      const countdown = rel ? releaseCountdown(rel.title, toIso(rel.on), today) : null;
      const release: OpenItem | undefined = rel && countdown ? { open: countdown, href: rel.runbook ? `/releases/${rel.slug}` : '/catalog' } : undefined;
      const item = openItem({ approval, tax: taxItem, release });
      return {
        id: m.slug, name: m.name, type: memberType(m.role, m.type, m.members ?? 1), genre: mainGenre(m.genres), releases: m.releases,
        contract: c ? `${short} · ${c.sig}` : 'No agreement yet',
        income: n(income.find((x) => x.artist_id === m.party_id)?.cents), ...item,
      };
    });
  });
}
