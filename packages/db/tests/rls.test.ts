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

    it('unclaimed royalties and profile claims stay within their tenant', async () => {
      await owner`INSERT INTO unclaimed_royalties (tenant_id, slug, source, what, why, amount_cents, held_since, claim_method)
        VALUES (${ids.a}, 'unc_a', 'mlc', 'Q2 mechanicals', 'Unmatched', 11380, '2026-08-01', 'MLC filing')`;
      await owner`INSERT INTO profile_claims (tenant_id, party_id, service, status) VALUES (${ids.a}, ${partyA}, 'spotify', 'confirmed')`;
      const mine = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT slug FROM unclaimed_royalties`);
      const theirs = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT slug FROM unclaimed_royalties`);
      expect(mine.map((r) => r.slug)).toEqual(['unc_a']);
      expect(theirs).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM profile_claims`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) =>
        tx`INSERT INTO profile_claims (tenant_id, party_id, service) VALUES (${ids.b}, ${partyA}, 'youtube')`)).rejects.toThrow(/cross-tenant reference/);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM unclaimed_royalties`)).toHaveLength(0);
    });

    it('registrations attach to the right kind of subject', async () => {
      const [{ id: rec }] = await owner`SELECT id FROM recordings WHERE slug = 'glasshouse'`;
      await expect(owner`INSERT INTO registrations (tenant_id, org, recording_id) VALUES (${ids.a}, 'mlc', ${rec})`).rejects.toThrow(/check constraint/);
    });
  });

  describe('splits', () => {
    let node = ''; let draft = ''; let sent = ''; let marco = ''; let label = '';
    const terms = (label: number, artist: number) => ({ producerBp: 300, labelOfNetBp: label, artistOfNetBp: artist, featureOfArtistBp: 1000 });
    beforeAll(async () => {
      [{ id: marco }] = await owner`INSERT INTO parties (tenant_id, slug, name) VALUES (${ids.a}, 'marco', 'Marco Dela') RETURNING id`;
      [{ id: label }] = await owner`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ids.a}, 'label-a', 'Label A', 'company') RETURNING id`;
      await owner`UPDATE memberships SET party_id = ${marco} WHERE user_id = ${ids.payee} AND tenant_id = ${ids.a}`;
      [{ id: node }] = await owner`INSERT INTO split_nodes (tenant_id, slug, label) VALUES (${ids.a}, 'gh-rec', 'Recording income') RETURNING id`;
      [{ id: sent }] = await owner`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from)
        VALUES (${ids.a}, ${node}, 4, 'sent', ${owner.json(terms(5000, 5000))}, '2026-10-01') RETURNING id`;
      const kesi = (await owner`SELECT id FROM parties WHERE slug = 'kesi'`)[0].id;
      for (const [role, party] of [['producer', marco], ['label', label], ['artist', kesi], ['feature', kesi]]) {
        await owner`INSERT INTO split_parties (tenant_id, version_id, role, party_id) VALUES (${ids.a}, ${sent}, ${role}, ${party})`;
      }
    });

    it('only a draft may be under 100%, and only one open version per node', async () => {
      await expect(owner`UPDATE split_versions SET terms = ${owner.json(terms(4000, 5500))} WHERE id = ${sent}`).rejects.toThrow(/check constraint/);
      await expect(owner`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from)
        VALUES (${ids.a}, ${node}, 5, 'draft', ${owner.json(terms(4000, 5500))}, '2027-01-01')`).rejects.toThrow(/split_versions_one_open/);
    });

    it('a payee sees the versions they are a party to, never drafts, and signs only their own line', async () => {
      const seen = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT version FROM split_versions`);
      expect(seen.map((r) => r.version)).toEqual([4]);
      const other = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) =>
        tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ids.payee} WHERE version_id = ${sent} AND role = 'label'`);
      expect(other.count).toBe(0);
      const mine = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) =>
        tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ids.payee} WHERE version_id = ${sent} AND role = 'producer'`);
      expect(mine.count).toBe(1);
      const again = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) =>
        tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ids.payee} WHERE version_id = ${sent} AND role = 'producer'`);
      expect(again.count).toBe(0); // already signed
      // Co-signers' names are visible to the payee; other parties aren't.
      const names = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT name FROM parties ORDER BY name`);
      expect(names.map((r) => r.name)).toEqual(['Kesi Vale', 'Label A', 'Marco Dela']);
    });

    it('the last signature puts the version in effect', async () => {
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ids.ua} WHERE version_id = ${sent} AND signed_at IS NULL AND role <> 'feature'`);
      expect((await owner`SELECT status FROM split_versions WHERE id = ${sent}`)[0].status).toBe('sent');
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ids.ua} WHERE version_id = ${sent} AND role = 'feature'`);
      expect((await owner`SELECT status FROM split_versions WHERE id = ${sent}`)[0].status).toBe('in_effect');
      [{ id: draft }] = await owner`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from)
        VALUES (${ids.a}, ${node}, 5, 'draft', ${owner.json(terms(4000, 5500))}, '2027-01-01') RETURNING id`;
      expect(draft).toBeTruthy();
    });

    it('another tenant sees no splits and cannot point at this tenant’s nodes', async () => {
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM split_nodes`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) =>
        tx`INSERT INTO split_versions (tenant_id, node_id, version, terms, effective_from) VALUES (${ids.b}, ${node}, 9, ${tx.json(terms(5000, 5000))}, '2027-01-01')`))
        .rejects.toThrow(/cross-tenant reference/);
    });
  });
  describe('statements', () => {
    let stA = ''; let lineA = ''; let kesi = ''; let marco = ''; let rec = '';
    const rows = (net: number) => owner.json([{ kind: 'start', label: 'Income', rule: 'All stores', amount: net, balance: net }]);
    beforeAll(async () => {
      [{ id: kesi }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.a} AND slug = 'kesi'`;
      [{ id: marco }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.a} AND slug = 'marco'`;
      [{ id: rec }] = await owner`SELECT id FROM recordings WHERE tenant_id = ${ids.a} AND slug = 'glasshouse'`;
      await owner.begin(async (tx) => {
        [{ id: stA }] = await tx`INSERT INTO income_statements (tenant_id, ref, source, period, total_cents) VALUES (${ids.a}, 'DS-1026', 'distributor', '2026-10-01', 1500) RETURNING id`;
        [{ id: lineA }] = await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, isrc, amount_cents) VALUES (${ids.a}, ${stA}, 1, 'Glasshouse', 'USNL1260014', 1000) RETURNING id`;
        await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, amount_cents, recording_id) VALUES (${ids.a}, ${stA}, 2, 'Glasshouse', 500, ${rec})`;
      });
      await owner.begin(async (tx) => {
        const [b] = await tx`INSERT INTO income_statements (tenant_id, ref, source, period, total_cents) VALUES (${ids.b}, 'HS-1026', 'distributor', '2026-10-01', 700) RETURNING id`;
        await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, amount_cents) VALUES (${ids.b}, ${b.id}, 1, 'Tidal', 700)`;
      });
      for (const [ref, party, net] of [['ST-2026-10-KV', kesi, 900], ['ST-2026-10-MD', marco, 100]] as const) {
        await owner`INSERT INTO payee_statements (tenant_id, ref, party_id, period, pays_on, rows, net_cents, simple, audit_ref)
          VALUES (${ids.a}, ${ref}, ${party}, '2026-10-01', '2026-11-10', ${rows(net)}, ${net}, ${owner.json([])}, 'AUD-1')`;
      }
    });

    it('a statement whose lines don’t add up to its total never commits', async () => {
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, async (tx) => {
        const [s] = await tx`INSERT INTO income_statements (tenant_id, ref, source, period, total_cents) VALUES (${ids.a}, 'SX-1026', 'soundexchange', '2026-10-01', 1000) RETURNING id`;
        await tx`INSERT INTO income_lines (tenant_id, statement_id, line_no, title, amount_cents) VALUES (${ids.a}, ${s.id}, 1, 'Glasshouse', 999)`;
      })).rejects.toThrow(/does not reconcile: lines total 999 cents, statement says 1000 cents/);
      expect(await owner`SELECT 1 FROM income_statements WHERE ref = 'SX-1026'`).toHaveLength(0);
    });

    it('each label sees only its own income', async () => {
      const a = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT ref FROM income_statements`);
      expect(a.map((r) => r.ref)).toEqual(['DS-1026']);
      const lines = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT title FROM income_lines`);
      expect(lines.map((r) => r.title)).toEqual(['Tidal']);
    });

    it('matching a line points it at a recording and can’t touch the money', async () => {
      const ok = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`UPDATE income_lines SET recording_id = ${rec}, matched_by = ${ids.ua}, matched_at = now() WHERE id = ${lineA}`);
      expect(ok.count).toBe(1);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE income_lines SET amount_cents = 1 WHERE id = ${lineA}`))
        .rejects.toThrow(/only its match can change/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`DELETE FROM income_lines WHERE id = ${lineA}`))
        .rejects.toThrow(/permission denied/);
    });

    it('another label can’t match your lines, or match its lines to your recordings', async () => {
      const none = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`UPDATE income_lines SET recording_id = NULL WHERE id = ${lineA}`);
      expect(none.count).toBe(0);
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`UPDATE income_lines SET recording_id = ${rec}`))
        .rejects.toThrow(/cross-tenant reference/);
    });

    it('a payee reads only their own statements, and no income', async () => {
      const mine = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT ref FROM payee_statements`);
      expect(mine.map((r) => r.ref)).toEqual(['ST-2026-10-MD']);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM income_lines`)).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM income_statements`)).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM payee_statements`)).toHaveLength(0);
    });

    it('an issued statement can’t be changed, and its net must be its last balance', async () => {
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE payee_statements SET net_cents = 1`))
        .rejects.toThrow(/permission denied/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO payee_statements (tenant_id, ref, party_id, period, pays_on, rows, net_cents, simple, audit_ref)
           VALUES (${ids.a}, 'ST-2026-10-XX', ${kesi}, '2026-10-01', '2026-11-10', ${tx.json([{ kind: 'start', label: 'x', rule: 'x', amount: 100, balance: 100 }])}, 101, ${tx.json([])}, 'AUD-2')`))
        .rejects.toThrow(/check constraint/);
    });
  });
});
