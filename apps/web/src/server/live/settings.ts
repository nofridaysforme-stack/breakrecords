import 'server-only';
import { formatMoney } from '@breakrecords/core/money';
import { dayMonthYear } from '@breakrecords/core/payouts';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { Settings, Theme } from '@/data/api';
import { settingsNav } from '@/data/ops';
import { checkTheme, type ThemeColors } from '@/lib/theme';
import { sql } from '../db';
import type { RequestContext } from '../context';

const n = (v: unknown) => Number(v ?? 0);

async function settingsIn(tx: Tx, ctx: RequestContext): Promise<Settings> {
  const [cfg] = await tx<{ country: string; profile: string; statement_period: string; spend_cap_cents: string }[]>`SELECT * FROM label_settings`;
  const [policy] = await tx<{ minimum_cents: string }[]>`SELECT minimum_cents FROM payout_policies`;
  const routes = await tx<{ type: Settings['routing'][number]['type']; label: string; rule: string; approver: string; cap_cents: string | null }[]>`
    SELECT type::text AS type, label, rule, approver, cap_cents FROM approval_routes ORDER BY position`;
  const ints = await tx<{ slug: string; name: string; abbr: string; state: 'ok' | 'off' | 'err'; status: string }[]>`
    SELECT slug, name, abbr, state::text AS state, status FROM integrations ORDER BY position, name`;
  const team = await tx<{ user_id: string; name: string | null; email: string; role: string; title: string | null }[]>`SELECT * FROM app_team()`;
  const invites = await tx<{ email: string; role: 'owner' | 'team' | 'payee'; party_slug: string | null; added_at: Date; joined: boolean }[]>`SELECT * FROM app_invites()`;
  const payees = await tx<{ slug: string; name: string }[]>`SELECT p.slug, p.name FROM payees y JOIN parties p ON p.id = y.party_id ORDER BY p.name`;
  return {
    nav: settingsNav,
    routing: routes.map((r) => ({ type: r.type, label: r.label, rule: r.rule, who: r.approver, cap: r.cap_cents === null ? 'Always' : `Over ${formatMoney(n(r.cap_cents), { wholeIfRound: true })}` })),
    config: {
      name: ctx.tenantName, country: cfg?.country ?? 'US', profile: cfg?.profile ?? 'Not set', statementPeriod: cfg?.statement_period ?? 'Not set',
      minimumPayout: policy ? n(policy.minimum_cents) : 2500, spendCap: cfg ? n(cfg.spend_cap_cents) : 0,
    },
    integrations: ints.map((i) => ({ id: i.slug, name: i.name, abbr: i.abbr, state: i.state, status: i.status })),
    team: team.map((t) => ({ id: t.user_id, name: t.name ?? t.email.split('@')[0], role: t.title ?? (t.role === 'owner' ? 'Owner' : 'Team') })),
    invites: invites.map((i) => ({ email: i.email, role: i.role, payee: i.party_slug ? payees.find((p) => p.slug === i.party_slug)?.name ?? i.party_slug : null, added: dayMonthYear(i.added_at), joined: i.joined })),
    canInvite: ctx.role === 'owner',
    payeeOptions: payees.map((p) => ({ id: p.slug, name: p.name })),
  } as Settings;
}

/** Settings (5h) for the signed-in tenant. The minimum payout is read from payouts. */
export function liveSettings(ctx: RequestContext): Promise<Settings> {
  return withTenant(sql, ctx, (tx) => settingsIn(tx, ctx));
}

/**
 * Connecting needs the partner's account, which arrives with a later stage. The app never flips
 * an integration on by itself; it says which stage brings it.
 */
export function liveConnect(ctx: RequestContext, slug: string): Promise<{ ok: false; status: number; error: 'not_found' | 'not_yet'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    const [i] = await tx<{ name: string; arrives_with: string | null }[]>`SELECT name, arrives_with FROM integrations WHERE slug = ${slug}`;
    if (!i) return { ok: false, status: 404, error: 'not_found', message: 'No such integration.' } as const;
    return { ok: false, status: 409, error: 'not_yet', message: `Connecting ${i.name} needs its account set up first. It arrives with ${i.arrives_with ?? 'a later stage'}.` } as const;
  });
}

async function themeIn(tx: Tx): Promise<Theme | null> {
  const [w] = await tx<{ name: string; domain: string; email: string; dns_status: string; theme: ThemeColors; published_at: Date | null; by: string | null }[]>`
    SELECT app_licensee_name() AS name, w.domain, w.email, w.dns_status, w.theme, w.published_at, coalesce(u.name, split_part(u.email, '@', 1)) AS by
    FROM white_label w LEFT JOIN users u ON u.id = w.published_by`;
  if (!w) return null;
  const subs = await tx<{ name: string; artists: number }[]>`SELECT * FROM app_sub_tenants()`;
  const [{ owns }] = await tx<{ owns: boolean }[]>`SELECT app_owns_licensee() AS owns`;
  return {
    theme: w.theme, tenant: { name: w.name, domain: w.domain, email: w.email, dns: w.dns_status, subTenants: subs },
    published: w.published_at ? { at: dayMonthYear(w.published_at), by: w.by ?? 'Someone' } : null, canPublish: owns,
  };
}

const NO_THEME: Theme = { theme: { background: '#121212', surface: '#1c1c1c', brand: '#5c1424', primary: '#e8622c', text: '#f2f2f2' }, // lint-allow-hex: platform default theme
  tenant: { name: 'Indie SRVCS', domain: 'indiesrvcs.com', email: 'support@indiesrvcs.com', dns: 'Not white-labelled', subTenants: [] }, published: null, canPublish: false };

/** The licensee's theme, read by every label under it. A label with no licensee gets the platform's own. */
export async function liveTheme(ctx: RequestContext): Promise<Theme> {
  return (await withTenant(sql, ctx, themeIn)) ?? NO_THEME;
}

export type ThemeWrite = { ok: true; value: Theme } | { ok: false; status: number; error: 'forbidden' | 'fails_contrast' | 'not_found'; message: string };

/** Publishes the theme. Refused unless every text pair passes WCAG AA, and unless you own the licensee. Audited. */
export function livePublishTheme(ctx: RequestContext, theme: ThemeColors): Promise<ThemeWrite> {
  const failing = checkTheme(theme).filter((c) => !c.pass);
  if (failing.length) return Promise.resolve({ ok: false, status: 409, error: 'fails_contrast', message: `${failing.map((f) => f.pair).join(', ')} ${failing.length === 1 ? 'fails' : 'fail'} WCAG AA.` });
  return withTenant(sql, ctx, async (tx) => {
    const [{ owns, licensee }] = await tx<{ owns: boolean; licensee: string | null }[]>`SELECT app_owns_licensee() AS owns, app_licensee() AS licensee`;
    if (!licensee) return { ok: false, status: 404, error: 'not_found', message: 'This label isn’t white-labelled.' } as const;
    if (!owns) return { ok: false, status: 403, error: 'forbidden', message: 'Only the licensee’s owners can publish its theme.' } as const;
    const done = await tx`UPDATE white_label SET theme = ${tx.json(theme)}, published_at = now(), published_by = ${ctx.userId} WHERE tenant_id = ${licensee}`;
    if (!done.count) return { ok: false, status: 404, error: 'not_found', message: 'This label isn’t white-labelled.' } as const;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SET-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'theme.published', ${licensee}, ${tx.json(theme)})`;
    return { ok: true, value: (await themeIn(tx))! } as const;
  });
}

export type InviteWrite = { ok: true; value: Settings } | { ok: false; status: number; error: 'forbidden' | 'not_found' | 'invalid'; message: string };

/** Lets someone sign in to this label (owners only). Nothing is emailed; they sign in with this address. Audited. */
export function liveInvite(ctx: RequestContext, c: { email: string; role: 'team' | 'payee'; payeeId?: string }): Promise<InviteWrite> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role !== 'owner') return { ok: false, status: 403, error: 'forbidden', message: 'Only the label’s owners invite people.' } as const;
    if (c.role === 'payee') {
      const [p] = await tx`SELECT 1 FROM payees y JOIN parties p ON p.id = y.party_id WHERE p.slug = ${c.payeeId ?? ''}`;
      if (!p) return { ok: false, status: 404, error: 'not_found', message: 'No such payee.' } as const;
    }
    await tx`INSERT INTO allowlist (email, tenant_id, role, party_slug, added_by) VALUES (${c.email}, ${ctx.tenantId}, ${c.role}, ${c.role === 'payee' ? c.payeeId! : null}, ${ctx.userId})
      ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role, party_slug = EXCLUDED.party_slug, added_by = EXCLUDED.added_by`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-INV-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'invite.created', ${c.email}, ${tx.json({ role: c.role, payee: c.payeeId ?? null })})`;
    return { ok: true, value: await settingsIn(tx, ctx) } as const;
  });
}

/** Withdraws an invitation nobody has used yet. Someone who already joined is removed elsewhere. */
export function liveUninvite(ctx: RequestContext, email: string): Promise<InviteWrite> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role !== 'owner') return { ok: false, status: 403, error: 'forbidden', message: 'Only the label’s owners manage invitations.' } as const;
    const [i] = await tx<{ joined: boolean }[]>`SELECT joined FROM app_invites() WHERE email = ${email}`;
    if (!i) return { ok: false, status: 404, error: 'not_found', message: 'No such invitation.' } as const;
    if (i.joined) return { ok: false, status: 409, error: 'invalid', message: 'They’ve already joined, so there’s no invitation to withdraw.' } as const;
    await tx`DELETE FROM allowlist WHERE email = ${email} AND tenant_id = ${ctx.tenantId}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-INV-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'invite.withdrawn', ${email}, '{}')`;
    return { ok: true, value: await settingsIn(tx, ctx) } as const;
  });
}
