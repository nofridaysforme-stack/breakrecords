// Row-level security, tested as the real app role. Needs a migrated database:
// TEST_DATABASE_URL (owner, to arrange data) and TEST_APP_DATABASE_URL (br_app).
// Stage 0 gate: "cross-tenant reads fail".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, memberships, withTenant, type Sql } from '../src/client';

const OWNER = process.env.TEST_DATABASE_URL;
const APP = process.env.TEST_APP_DATABASE_URL;

describe.skipIf(!OWNER || !APP)('row-level security', () => {
  let owner: Sql; let app: Sql;
  const ids = { lic: '', a: '', b: '', ua: '', ub: '', payee: '', licOwner: '' };

  beforeAll(async () => {
    owner = connect(OWNER!); app = connect(APP!);
    await owner`TRUNCATE tenants, users CASCADE`;
    [{ id: ids.lic }] = await owner`INSERT INTO tenants (slug, name, kind) VALUES ('lic', 'Licensee', 'licensee') RETURNING id`;
    [{ id: ids.a }] = await owner`INSERT INTO tenants (slug, name, kind, parent_id) VALUES ('a', 'Label A', 'label', ${ids.lic}) RETURNING id`;
    [{ id: ids.b }] = await owner`INSERT INTO tenants (slug, name, kind) VALUES ('b', 'Label B', 'label') RETURNING id`;
    for (const [k, email] of [['ua', 'a@x.test'], ['ub', 'b@x.test'], ['payee', 'p@x.test'], ['licOwner', 'l@x.test']] as const) {
      [{ id: ids[k] }] = await owner`INSERT INTO users (email) VALUES (${email}) RETURNING id`;
    }
    await owner`INSERT INTO memberships (user_id, tenant_id, role) VALUES
      (${ids.ua}, ${ids.a}, 'owner'), (${ids.ub}, ${ids.b}, 'owner'), (${ids.payee}, ${ids.a}, 'payee'), (${ids.licOwner}, ${ids.lic}, 'owner')`;
    for (const [t, id] of [[ids.a, 'apr_a'], [ids.b, 'apr_b']]) {
      await owner`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, impact, risk)
        VALUES (${t}, ${id}, 'agent', 'money', 'Payout', 'Royalties Agent', 'Nov 10', '$1', 'low')`;
    }
  });
  afterAll(async () => { await owner?.end(); await app?.end(); });

  it('a member sees only their tenant', async () => {
    const rows = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT id FROM approvals`);
    expect(rows.map((r) => r.id)).toEqual(['apr_a']);
  });

  it('asking for another tenant by id returns nothing', async () => {
    const rows = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT id FROM approvals WHERE tenant_id = ${ids.b}`);
    expect(rows).toHaveLength(0);
  });

  it('claiming a tenant you do not belong to returns nothing and cannot write', async () => {
    const rows = await withTenant(app, { userId: ids.ua, tenantId: ids.b }, (tx) => tx`SELECT id FROM approvals`);
    expect(rows).toHaveLength(0);
    await expect(withTenant(app, { userId: ids.ua, tenantId: ids.b }, (tx) =>
      tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, impact, risk) VALUES (${ids.b}, 'x', 'user', 'plan', 't', 'a', 'd', 'i', 'low')`))
      .rejects.toThrow(/row-level security/);
  });

  it('with no tenant set, nothing is visible', async () => {
    expect(await app`SELECT id FROM approvals`).toHaveLength(0);
    expect(await app`SELECT id FROM tenants`).toHaveLength(0);
  });

  it('a licensee owner can act in its sub-tenant, not in others', async () => {
    const sub = await withTenant(app, { userId: ids.licOwner, tenantId: ids.a }, (tx) => tx`SELECT id FROM approvals`);
    expect(sub.map((r) => r.id)).toEqual(['apr_a']);
    const other = await withTenant(app, { userId: ids.licOwner, tenantId: ids.b }, (tx) => tx`SELECT id FROM approvals`);
    expect(other).toHaveLength(0);
  });

  it('payees cannot decide approvals', async () => {
    await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) =>
      tx`INSERT INTO approval_decisions (tenant_id, approval_id, status, decided_by, audit_id) VALUES (${ids.a}, 'apr_a', 'approved', ${ids.payee}, 'AUD-1')`))
      .rejects.toThrow(/row-level security/);
  });

  it('a decision must be recorded as the signed-in user', async () => {
    await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
      tx`INSERT INTO approval_decisions (tenant_id, approval_id, status, decided_by, audit_id) VALUES (${ids.a}, 'apr_a', 'approved', ${ids.ub}, 'AUD-2')`))
      .rejects.toThrow(/row-level security/);
  });

  it('a rejection without a reason is refused by the database too', async () => {
    await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
      tx`INSERT INTO approval_decisions (tenant_id, approval_id, status, reason, decided_by, audit_id) VALUES (${ids.a}, 'apr_a', 'rejected', ' ', ${ids.ua}, 'AUD-3')`))
      .rejects.toThrow(/check constraint/);
  });

  it('the audit log is append-only', async () => {
    await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
      tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref) VALUES (${ids.a}, 'AUD-4', ${ids.ua}, 'test', 'apr_a')`);
    await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`DELETE FROM audit_events`)).rejects.toThrow(/permission denied/);
    await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE audit_events SET kind = 'x'`)).rejects.toThrow(/permission denied/);
  });

  it('memberships lists only your own tenants', async () => {
    expect((await memberships(app, ids.ua)).map((m) => m.slug)).toEqual(['a']);
    expect((await memberships(app, ids.ub)).map((m) => m.slug)).toEqual(['b']);
  });

  it('sign-in checks the allowlist and claims invites', async () => {
    await owner`INSERT INTO allowlist (email, tenant_id, role) VALUES ('new@x.test', ${ids.b}, 'team')`;
    expect((await app`SELECT app_may_sign_in('NEW@x.test') AS ok`)[0].ok).toBe(true);
    expect((await app`SELECT app_may_sign_in('nobody@x.test') AS ok`)[0].ok).toBe(false);
    const [{ id }] = await app`INSERT INTO users (email) VALUES ('new@x.test') RETURNING id`;
    expect((await app`SELECT app_claim_invites(${id}) AS n`)[0].n).toBe(1);
    expect((await memberships(app, id)).map((m) => [m.slug, m.role])).toEqual([['b', 'team']]);
  });

  describe('catalog', () => {
    let partyA = ''; let partyB = '';
    beforeAll(async () => {
      [{ id: partyA }] = await owner`INSERT INTO parties (tenant_id, slug, name) VALUES (${ids.a}, 'kesi', 'Kesi Vale') RETURNING id`;
      [{ id: partyB }] = await owner`INSERT INTO parties (tenant_id, slug, name) VALUES (${ids.b}, 'harbor-artist', 'Harbor Artist') RETURNING id`;
      await owner`INSERT INTO recordings (tenant_id, slug, title, artist_id, isrc) VALUES (${ids.a}, 'glasshouse', 'Glasshouse', ${partyA}, 'USNL12600014')`;
      await owner`INSERT INTO recordings (tenant_id, slug, title, artist_id) VALUES (${ids.b}, 'tidal', 'Tidal', ${partyB})`;
    });

    it('each label sees only its own recordings', async () => {
      const a = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT slug FROM recordings`);
      const b = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT slug FROM recordings`);
      expect(a.map((r) => r.slug)).toEqual(['glasshouse']);
      expect(b.map((r) => r.slug)).toEqual(['tidal']);
    });

    it('another label cannot change your recordings', async () => {
      const n = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`UPDATE recordings SET genre = 'x' WHERE slug = 'glasshouse'`);
      expect(n.count).toBe(0);
    });

    it('payees cannot read the label’s catalog', async () => {
      const rows = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT slug FROM recordings`);
      expect(rows).toHaveLength(0);
    });

    it('a record cannot point at another tenant’s party', async () => {
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO recordings (tenant_id, slug, title, artist_id) VALUES (${ids.a}, 'stolen', 'Stolen', ${partyB})`))
        .rejects.toThrow(/cross-tenant reference/);
    });

    it('registrations attach to the right kind of subject', async () => {
      const [{ id: rec }] = await owner`SELECT id FROM recordings WHERE slug = 'glasshouse'`;
      await expect(owner`INSERT INTO registrations (tenant_id, org, recording_id) VALUES (${ids.a}, 'mlc', ${rec})`).rejects.toThrow(/check constraint/);
    });
  });
});
