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
    SELECT t.id AS "tenantId", t.slug, t.name, t.kind::text AS kind, m.role::text AS role
    FROM memberships m JOIN tenants t ON t.id = m.tenant_id
    ORDER BY m.created_at, t.name`);
}
