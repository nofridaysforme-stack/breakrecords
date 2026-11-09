// The only way the app talks to Postgres for tenant data. Every call runs in a transaction
// that sets app.user_id and app.tenant_id, so row-level security scopes it. Connect as the
// br_app role (it owns nothing, so policies always apply).
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
export type Ctx = { userId: string; tenantId: string };

export function connect(url: string, opts: postgres.Options<Record<string, postgres.PostgresType>> = {}): Sql {
  return postgres(url, { max: 5, onnotice: () => {}, ...opts });
}

/** Runs `fn` as this user in this tenant. Rows from other tenants are invisible and unwritable. */
export function withTenant<T>(sql: Sql, ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${ctx.userId}, true), set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Runs `fn` as a signed-in user with no tenant chosen yet (to list their memberships). */
export function asUser<T>(sql: Sql, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export type Membership = { tenantId: string; slug: string; name: string; kind: 'licensee' | 'label' | 'artist'; role: 'owner' | 'team' | 'payee' };

export function memberships(sql: Sql, userId: string): Promise<Membership[]> {
  return asUser(sql, userId, async (tx) => tx<Membership[]>`
    SELECT "tenantId", slug, name, kind, role FROM (
      SELECT t.id AS "tenantId", t.slug, t.name, t.kind::text AS kind, m.role::text AS role, m.created_at, 0 AS via
      FROM memberships m JOIN tenants t ON t.id = m.tenant_id
      UNION ALL
      -- A licensee's owners also work in its labels, as owners.
      SELECT c.id, c.slug, c.name, c.kind::text, 'owner', m.created_at, 1
      FROM memberships m JOIN tenants c ON c.parent_id = m.tenant_id
      WHERE m.role = 'owner' AND NOT EXISTS (SELECT 1 FROM memberships x WHERE x.user_id = m.user_id AND x.tenant_id = c.id)
    ) all_tenants ORDER BY created_at, via, name`);
}
