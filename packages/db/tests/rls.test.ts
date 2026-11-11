// Row-level security, tested as the real app role. Needs a migrated database:
// TEST_DATABASE_URL (owner, to arrange data) and TEST_APP_DATABASE_URL (br_app).
// Stage 0 gate: "cross-tenant reads fail".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { asUser, connect, memberships, withTenant, type Sql } from '../src/client';

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

  it('the sign-in tables have RLS on, and br_app can still use them (Supabase turns RLS on by itself)', async () => {
    const rows = await owner<{ relname: string; on: boolean }[]>`SELECT relname, relrowsecurity AS on FROM pg_class
      WHERE relname IN ('users', 'accounts', 'sessions', 'verification_tokens') AND relnamespace = 'public'::regnamespace ORDER BY relname`;
    expect(rows.every((r) => r.on)).toBe(true);
    await app`INSERT INTO verification_tokens (identifier, token, expires) VALUES ('t@x.test', 'tok', now() + interval '5 minutes')`;
    expect(await app`DELETE FROM verification_tokens WHERE identifier = 't@x.test' RETURNING token`).toHaveLength(1);
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
  describe('payouts', () => {
    let batch = ''; let kesi = ''; let marco = ''; let account = '';
    const asOwner = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
    beforeAll(async () => {
      [{ id: kesi }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.a} AND slug = 'kesi'`;
      [{ id: marco }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.a} AND slug = 'marco'`;
      await owner`INSERT INTO payees (tenant_id, party_id, tax_form) VALUES (${ids.a}, ${kesi}, 'W-9'), (${ids.a}, ${marco}, 'W-9')`;
      [{ id: batch }] = await owner`INSERT INTO payout_batches (tenant_id, slug, name, cadence, period, pays_on, status, approval_id)
        VALUES (${ids.a}, 'pb-a', 'October', 'monthly', '2026-10-01', '2026-11-10', 'awaiting', 'apr_a') RETURNING id`;
      await owner`INSERT INTO payout_lines (tenant_id, batch_id, party_id, role, amount_cents) VALUES (${ids.a}, ${batch}, ${kesi}, 'Artist', 1000), (${ids.a}, ${batch}, ${marco}, 'Producer', 300)`;
      const [{ id: rel }] = await owner`INSERT INTO releases (tenant_id, slug, title, kind, artist_id) VALUES (${ids.a}, 'rel_a', 'Release A', 'single', ${kesi}) RETURNING id`;
      [{ id: account }] = await owner`INSERT INTO recoupment_accounts (tenant_id, release_id, advance_cents) VALUES (${ids.a}, ${rel}, 0) RETURNING id`;
    });

    it('money is never sent without an approved approval, and sending ends undo', async () => {
      await owner`DELETE FROM approval_decisions WHERE tenant_id = ${ids.a} AND approval_id = 'apr_a'`;
      await expect(asOwner((tx) => tx`UPDATE payout_batches SET status = 'sent', sent_at = now() WHERE id = ${batch}`)).rejects.toThrow(/no approved approval/);
      await owner`INSERT INTO approval_decisions (tenant_id, approval_id, status, reason, decided_by, audit_id) VALUES (${ids.a}, 'apr_a', 'rejected', 'No', ${ids.ua}, 'AUD-R')`;
      await expect(asOwner((tx) => tx`UPDATE payout_batches SET status = 'sent', sent_at = now() WHERE id = ${batch}`)).rejects.toThrow(/no approved approval/);
      await owner`UPDATE approval_decisions SET status = 'approved', reason = NULL WHERE tenant_id = ${ids.a} AND approval_id = 'apr_a'`;
      await asOwner((tx) => tx`UPDATE payout_batches SET status = 'sent', sent_at = now() WHERE id = ${batch}`);
      expect((await owner`SELECT executed_at FROM approvals WHERE tenant_id = ${ids.a} AND id = 'apr_a'`)[0].executed_at).not.toBeNull();
    });

    it('a sent batch and its lines never change', async () => {
      await expect(asOwner((tx) => tx`UPDATE payout_batches SET status = 'awaiting', sent_at = NULL WHERE id = ${batch}`)).rejects.toThrow(/can no longer change/);
      await expect(asOwner((tx) => tx`UPDATE payout_lines SET amount_cents = 1 WHERE batch_id = ${batch}`)).rejects.toThrow(/can no longer change/);
      await expect(asOwner((tx) => tx`DELETE FROM payout_batches WHERE id = ${batch}`)).rejects.toThrow(/permission denied/);
    });

    it('the app can’t record a batch as imported history to skip the approval', async () => {
      await expect(asOwner((tx) => tx`INSERT INTO payout_batches (tenant_id, slug, name, cadence, period, pays_on, status, imported, sent_at)
        VALUES (${ids.a}, 'pb-fake', 'Fake', 'monthly', '2026-10-01', '2026-11-10', 'sent', true, now())`)).rejects.toThrow(/permission denied/);
      await expect(asOwner((tx) => tx`INSERT INTO payout_batches (tenant_id, slug, name, cadence, period, pays_on, status)
        VALUES (${ids.a}, 'pb-fake', 'Fake', 'monthly', '2026-10-01', '2026-11-10', 'sent')`)).rejects.toThrow(/no approved approval/);
    });

    it('a payee reads only their own payee record and lines, and can’t ask or add', async () => {
      const lines = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT role FROM payout_lines`);
      expect(lines.map((r) => r.role)).toEqual(['Producer']);
      const mine = await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT party_id FROM payees`);
      expect(mine.map((r) => r.party_id)).toEqual([marco]);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT slug FROM payout_batches`)).toHaveLength(1);
      await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`INSERT INTO payee_requests (tenant_id, party_id, kind) VALUES (${ids.a}, ${kesi}, 'tax_form')`))
        .rejects.toThrow(/row-level security/);
      await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`INSERT INTO recoupable_costs (tenant_id, account_id, category, cost_cents, share_bp) VALUES (${ids.a}, ${account}, 'Promo', 100, 10000)`))
        .rejects.toThrow(/row-level security/);
    });

    it('one open request of each kind per payee', async () => {
      await asOwner((tx) => tx`INSERT INTO payee_requests (tenant_id, party_id, kind, requested_by) VALUES (${ids.a}, ${kesi}, 'tax_form', ${ids.ua})`);
      await expect(asOwner((tx) => tx`INSERT INTO payee_requests (tenant_id, party_id, kind, requested_by) VALUES (${ids.a}, ${kesi}, 'tax_form', ${ids.ua})`)).rejects.toThrow(/duplicate key/);
    });

    it('another label sees none of it and can’t point at it', async () => {
      for (const t of ['payout_batches', 'payout_lines', 'payees', 'recoupment_accounts']) {
        expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx.unsafe(`SELECT 1 FROM ${t}`))).toHaveLength(0);
      }
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`INSERT INTO recoupable_costs (tenant_id, account_id, category, cost_cents, share_bp) VALUES (${ids.b}, ${account}, 'Promo', 100, 10000)`))
        .rejects.toThrow(/cross-tenant reference/);
    });
  });
  describe('release runbooks', () => {
    let phase = ''; let rel = '';
    beforeAll(async () => {
      [{ id: rel }] = await owner`SELECT id FROM releases WHERE tenant_id = ${ids.a} AND slug = 'rel_a'`;
      [{ id: phase }] = await owner`INSERT INTO runbook_phases (tenant_id, release_id, position, name, offset_days) VALUES (${ids.a}, ${rel}, 0, '8 weeks out', -56) RETURNING id`;
      await owner`INSERT INTO runbook_tasks (tenant_id, phase_id, position, title, owner, state, gate_owner, blocks_delivery)
        VALUES (${ids.a}, ${phase}, 0, 'Masters accepted', 'Distribution Agent', 'locked', 'Distribution Agent', 'Masters: not delivered.')`;
      await owner`INSERT INTO release_pitches (tenant_id, release_id, text, char_limit) VALUES (${ids.a}, ${rel}, 'A late-night single.', 500)`;
    });

    it('the label’s team runs the runbook; payees and other labels see none of it', async () => {
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT title FROM runbook_tasks`)).toHaveLength(1);
      for (const who of [{ userId: ids.payee, tenantId: ids.a }, { userId: ids.ub, tenantId: ids.b }]) {
        for (const t of ['runbook_phases', 'runbook_tasks', 'release_pitches', 'release_budget_lines']) {
          expect(await withTenant(app, who, (tx) => tx.unsafe(`SELECT 1 FROM ${t}`))).toHaveLength(0);
        }
      }
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) =>
        tx`INSERT INTO runbook_tasks (tenant_id, phase_id, position, title, owner) VALUES (${ids.b}, ${phase}, 1, 'Sneak in', 'Me')`)).rejects.toThrow(/cross-tenant reference/);
    });

    it('a locked task names who holds the key; a phase has one kind of date; a pitch fits its limit', async () => {
      const asA = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
      await expect(asA((tx) => tx`INSERT INTO runbook_tasks (tenant_id, phase_id, position, title, owner, state) VALUES (${ids.a}, ${phase}, 1, 'Gate', 'Legal', 'locked')`)).rejects.toThrow(/check constraint/);
      await expect(asA((tx) => tx`INSERT INTO runbook_phases (tenant_id, release_id, position, name, starts_on, offset_days) VALUES (${ids.a}, ${rel}, 1, 'Both', '2027-01-01', -7)`)).rejects.toThrow(/check constraint/);
      await expect(asA((tx) => tx`UPDATE release_pitches SET char_limit = 5 WHERE release_id = ${rel}`)).rejects.toThrow(/check constraint/);
    });
  });
  describe('contracts', () => {
    let agreement = ''; let tpl = '';
    beforeAll(async () => {
      [{ id: tpl }] = await owner`INSERT INTO contract_templates (tenant_id, slug, name, version, updated_on, summary, clauses)
        VALUES (${ids.a}, 'producer', 'Producer agreement', 'v3', '2026-08-14', 'Points.', ${owner.json([])}) RETURNING id`;
      [{ id: agreement }] = await owner`INSERT INTO agreements (tenant_id, slug, name, source, template_id, terms, approval_id)
        VALUES (${ids.a}, 'ct_a', 'Producer agreement', 'template', ${tpl}, '3 points', 'apr_a') RETURNING id`;
    });

    it('the label’s team sees its contracts; payees and other labels see none', async () => {
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT slug FROM agreements`)).toHaveLength(1);
      for (const who of [{ userId: ids.payee, tenantId: ids.a }, { userId: ids.ub, tenantId: ids.b }]) {
        for (const t of ['agreements', 'agreement_parties', 'contract_templates', 'contract_reviews']) {
          expect(await withTenant(app, who, (tx) => tx.unsafe(`SELECT 1 FROM ${t}`))).toHaveLength(0);
        }
      }
      const [{ id: theirs }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.b} LIMIT 1`;
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO agreement_parties (tenant_id, agreement_id, party_id) VALUES (${ids.a}, ${agreement}, ${theirs})`)).rejects.toThrow(/cross-tenant reference/);
    });

    it('a template agreement names its template, and a review is a PDF or Word file that stays on record', async () => {
      const asA = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
      await expect(asA((tx) => tx`INSERT INTO agreements (tenant_id, slug, name, source) VALUES (${ids.a}, 'ct_b', 'No template', 'template')`)).rejects.toThrow(/check constraint/);
      await expect(asA((tx) => tx`INSERT INTO contract_reviews (tenant_id, file_name) VALUES (${ids.a}, 'deal.exe')`)).rejects.toThrow(/check constraint/);
      await asA((tx) => tx`INSERT INTO contract_reviews (tenant_id, file_name, requested_by) VALUES (${ids.a}, 'Sync offer.pdf', ${ids.ua})`);
      await expect(asA((tx) => tx`DELETE FROM contract_reviews`)).rejects.toThrow(/permission denied/);
    });
  });
  describe('roster', () => {
    it('only the label’s team sees who is on the roster', async () => {
      const [{ id: kesi }] = await owner`SELECT id FROM parties WHERE tenant_id = ${ids.a} AND slug = 'kesi'`;
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`INSERT INTO roster_members (tenant_id, party_id, role) VALUES (${ids.a}, ${kesi}, 'Solo artist')`);
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT role FROM roster_members`)).toHaveLength(1);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM roster_members`)).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM roster_members`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) =>
        tx`INSERT INTO roster_members (tenant_id, party_id, role) VALUES (${ids.b}, ${kesi}, 'Poached')`)).rejects.toThrow(/cross-tenant reference|duplicate key/);
    });
  });
  describe('funding', () => {
    it('offers carry their real terms; the app can only dismiss or decline them; other people see nothing', async () => {
      const asA = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
      await expect(asA((tx) => tx`INSERT INTO funding_opportunities (tenant_id, slug, kind, cash_cents, share_bp, deadline, fit_bp, verified_on)
        VALUES (${ids.a}, 'adv', 'advance', 800000, 6000, '2026-12-01', 7100, '2026-11-02')`)).rejects.toThrow(/check constraint/); // an advance says what's repaid
      await asA((tx) => tx`INSERT INTO funding_opportunities (tenant_id, slug, kind, cash_cents, repay_total_cents, share_bp, deadline, fit_bp, verified_on)
        VALUES (${ids.a}, 'adv', 'advance', 800000, 896000, 6000, '2026-12-01', 7100, '2026-11-02')`);
      expect((await asA((tx) => tx`UPDATE funding_opportunities SET dismissed_at = now(), dismissed_by = ${ids.ua} WHERE slug = 'adv'`)).count).toBe(1);
      await expect(asA((tx) => tx`UPDATE funding_opportunities SET cash_cents = 1 WHERE slug = 'adv'`)).rejects.toThrow(/permission denied/);
      for (const who of [{ userId: ids.payee, tenantId: ids.a }, { userId: ids.ub, tenantId: ids.b }]) {
        expect(await withTenant(app, who, (tx) => tx`SELECT 1 FROM funding_opportunities`)).toHaveLength(0);
      }
    });
  });
  describe('departments and activity', () => {
    it('“Act within limits” is refused where the work is money, signatures or filings, and only autonomy and person can change', async () => {
      await owner`INSERT INTO departments (tenant_id, slug, name, agent, phase, autonomy, can_act, act_note) VALUES
        (${ids.a}, 'legal', 'Legal', 'Legal Agent', 1, 'draft_and_wait', false, 'Signatures always wait for you.'),
        (${ids.a}, 'metadata', 'Metadata', 'Metadata Agent', 1, 'draft_and_wait', true, '')`;
      const asA = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
      await expect(asA((tx) => tx`UPDATE departments SET autonomy = 'act_within_limits' WHERE slug = 'legal'`)).rejects.toThrow(/check constraint/);
      expect((await asA((tx) => tx`UPDATE departments SET autonomy = 'act_within_limits' WHERE slug = 'metadata'`)).count).toBe(1);
      await expect(asA((tx) => tx`UPDATE departments SET can_act = true WHERE slug = 'legal'`)).rejects.toThrow(/permission denied/);
      await expect(asA((tx) => tx`UPDATE departments SET person_id = ${ids.payee} WHERE slug = 'legal'`)).rejects.toThrow(/isn't on this label's team/);
      expect((await asA((tx) => tx`UPDATE departments SET person_id = ${ids.ua} WHERE slug = 'legal'`)).count).toBe(1);
    });

    it('agent history is append-only, and payees and other labels see none of it', async () => {
      const asA = <T,>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: ids.ua, tenantId: ids.a }, fn);
      await asA((tx) => tx`INSERT INTO agent_events (tenant_id, id, occurred_at, kind, text, who, dept) VALUES (${ids.a}, 'RUN-1', now(), 'Agent run', 'Did a thing', 'Metadata Agent', 'Metadata')`);
      await expect(asA((tx) => tx`UPDATE agent_events SET text = 'Did something else'`)).rejects.toThrow(/permission denied/);
      for (const who of [{ userId: ids.payee, tenantId: ids.a }, { userId: ids.ub, tenantId: ids.b }]) {
        expect(await withTenant(app, who, (tx) => tx`SELECT 1 FROM agent_events`)).toHaveLength(0);
        expect(await withTenant(app, who, (tx) => tx`SELECT 1 FROM departments`)).toHaveLength(0);
      }
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT * FROM app_team()`)).toHaveLength(0);
      expect((await asA((tx) => tx`SELECT * FROM app_team()`)).map((r) => r.user_id)).toEqual([ids.ua]);
    });
  });
  describe('settings and white label', () => {
    const theme = { background: '#0f1a1c', surface: '#13221f', brand: '#1d4a4f', primary: '#e2b33c', text: '#e8f0ef' }; // lint-allow-hex: test data
    beforeAll(async () => {
      await owner`INSERT INTO white_label (tenant_id, domain, email, dns_status, theme) VALUES (${ids.lic}, 'app.lic.test', 'team@lic.test', 'Waiting', ${owner.json(theme)})`;
    });

    it('a label reads its licensee’s theme; only the licensee’s owners publish it', async () => {
      const read = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT domain FROM white_label`);
      expect(read.map((r) => r.domain)).toEqual(['app.lic.test']);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM white_label`)).toHaveLength(0); // not under this licensee
      const label = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE white_label SET theme = ${tx.json(theme)}, published_at = now(), published_by = ${ids.ua}`);
      expect(label.count).toBe(0);
      const lic = await withTenant(app, { userId: ids.licOwner, tenantId: ids.lic }, (tx) => tx`UPDATE white_label SET theme = ${tx.json(theme)}, published_at = now(), published_by = ${ids.licOwner}`);
      expect(lic.count).toBe(1);
      await expect(withTenant(app, { userId: ids.licOwner, tenantId: ids.lic }, (tx) => tx`UPDATE white_label SET domain = 'evil.test'`)).rejects.toThrow(/permission denied/);
    });

    it('a theme is five valid colors; signatures and filings always need a person', async () => {
      await expect(withTenant(app, { userId: ids.licOwner, tenantId: ids.lic }, (tx) =>
        tx`UPDATE white_label SET theme = ${tx.json({ ...theme, primary: 'orange' })}, published_by = ${ids.licOwner}`)).rejects.toThrow(/check constraint/);
      await expect(owner`INSERT INTO approval_routes (tenant_id, type, label, rule, approver, cap_cents) VALUES (${ids.a}, 'signature', 'Signature', 'Any', 'Owner', 10000)`)
        .rejects.toThrow(/check constraint/);
      await owner`INSERT INTO integrations (tenant_id, slug, name, abbr, status) VALUES (${ids.a}, 'distributor', 'Distributor', 'DS', 'Not connected')`;
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE integrations SET state = 'ok'`)).rejects.toThrow(/permission denied/);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM integrations`)).toHaveLength(0);
    });
  });
  describe('prepared documents', () => {
    let work = ''; let otherWork = ''; let doc = '';
    const sha = 'a'.repeat(64);
    beforeAll(async () => {
      [{ id: work }] = await owner`INSERT INTO works (tenant_id, slug, title) VALUES (${ids.a}, 'doc-song', 'Doc Song') RETURNING id`;
      [{ id: otherWork }] = await owner`INSERT INTO works (tenant_id, slug, title) VALUES (${ids.b}, 'their-song', 'Their Song') RETURNING id`;
      await owner`INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents) VALUES (${ids.a}, 'US', 'Small label', 'Quarterly', 0) ON CONFLICT DO NOTHING`;
    });

    it('the team adds a version as themselves; nobody changes or deletes one', async () => {
      [{ id: doc }] = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO documents (tenant_id, kind, subject, subject_id, version, title, pdf_key, sha256, created_by)
           VALUES (${ids.a}, 'split_sheet', 'work', ${work}, 1, 'Split sheet', 'k/1.pdf', ${sha}, ${ids.ua}) RETURNING id`);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO documents (tenant_id, kind, subject, subject_id, version, title, pdf_key, sha256, created_by)
           VALUES (${ids.a}, 'split_sheet', 'work', ${work}, 2, 'Split sheet', 'k/2.pdf', ${sha}, ${ids.ub})`)).rejects.toThrow(/row-level security/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE documents SET title = 'x'`)).rejects.toThrow(/permission denied/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`DELETE FROM documents`)).rejects.toThrow(/permission denied/);
    });

    it('other labels and payees see none of them, and none can point at another label’s song', async () => {
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM documents`)).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM documents`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO documents (tenant_id, kind, subject, subject_id, version, title, pdf_key, sha256, created_by)
           VALUES (${ids.a}, 'split_sheet', 'work', ${otherWork}, 1, 'Split sheet', 'k/x.pdf', ${sha}, ${ids.ua})`)).rejects.toThrow(/cross-tenant reference/);
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) =>
        tx`INSERT INTO document_reviews (tenant_id, document_id, model, findings, next_steps, created_by)
           VALUES (${ids.b}, ${doc}, 'm', '[]', 'x', ${ids.ub})`)).rejects.toThrow(/cross-tenant reference/);
    });

    it('a split sheet is about a song; label copy about a release', async () => {
      await expect(owner`INSERT INTO documents (tenant_id, kind, subject, subject_id, version, title, pdf_key, sha256, created_by)
        VALUES (${ids.a}, 'label_copy', 'work', ${work}, 1, 'x', 'k', ${sha}, ${ids.ua})`).rejects.toThrow(/check constraint/);
    });

    it('only an owner turns AI assistance on', async () => {
      await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT app_set_ai_assist(true)`)).rejects.toThrow(/only the label/);
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_set_ai_assist(true) AS on`)).toEqual([{ on: true }]);
      expect((await owner`SELECT ai_assist FROM label_settings WHERE tenant_id = ${ids.a}`)[0].ai_assist).toBe(true);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE label_settings SET ai_assist = false`)).rejects.toThrow(/permission denied/);
    });

    it('a writer’s publisher must be one of the label’s own parties', async () => {
      const [{ id: theirs }] = await owner`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ids.b}, 'their-pub', 'Their Publishing', 'company') RETURNING id`;
      const [{ id: writer }] = await owner`INSERT INTO parties (tenant_id, slug, name) VALUES (${ids.a}, 'doc-writer', 'Doc Writer') RETURNING id`;
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) =>
        tx`INSERT INTO work_writers (tenant_id, work_id, party_id, share_bp, publisher_id) VALUES (${ids.a}, ${work}, ${writer}, 10000, ${theirs})`)).rejects.toThrow(/cross-tenant reference/);
    });
  });
  describe('sign-up with invite codes', () => {
    const h = (c: string) => createHash('sha256').update(c).digest('hex');
    let admin = '';
    beforeAll(async () => {
      [{ id: admin }] = await owner`INSERT INTO users (email) VALUES ('staff@indie.test') RETURNING id`;
      await owner`INSERT INTO platform_admins (email) VALUES ('staff@indie.test') ON CONFLICT DO NOTHING`;
    });

    it('only staff make, list and revoke codes; the app role can’t read the tables', async () => {
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_create_invite_code(${h('X')}, 'AAAA', 'n', 1, null)`)).rejects.toThrow(/only Indie SRVCS staff/);
      const [{ id }] = await asUser(app, admin, (tx) => tx`SELECT app_create_invite_code(${h('CODE-ONE')}, 'E-ONE', 'For Kesi', 2, null) AS id`);
      expect(id).toBeTruthy();
      expect((await asUser(app, admin, (tx) => tx`SELECT note, uses FROM app_invite_codes()`)).map((r) => r.note)).toContain('For Kesi');
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT * FROM app_invite_codes()`)).toHaveLength(0);
      await expect(app`SELECT 1 FROM invite_codes`).rejects.toThrow(/permission denied/);
      await expect(app`SELECT 1 FROM signups`).rejects.toThrow(/permission denied/);
    });

    it('a code works up to its uses, once per email; bad, expired and revoked codes fail', async () => {
      expect((await app`SELECT app_redeem_invite(${h('CODE-ONE')}, 'New.Artist@x.test') AS r`)[0].r).toBe('ok');
      expect((await app`SELECT app_redeem_invite(${h('CODE-ONE')}, 'new.artist@x.test') AS r`)[0].r).toBe('already');
      expect((await app`SELECT app_redeem_invite(${h('CODE-ONE')}, 'band@x.test') AS r`)[0].r).toBe('ok');
      expect((await app`SELECT app_redeem_invite(${h('CODE-ONE')}, 'third@x.test') AS r`)[0].r).toBe('used_up');
      expect((await app`SELECT app_redeem_invite(${h('NOPE')}, 'x@x.test') AS r`)[0].r).toBe('invalid');
      const [{ id }] = await asUser(app, admin, (tx) => tx`SELECT app_create_invite_code(${h('OLD')}, 'OLD1', 'old', 5, now() - interval '1 day') AS id`);
      expect((await app`SELECT app_redeem_invite(${h('OLD')}, 'late@x.test') AS r`)[0].r).toBe('expired');
      await asUser(app, admin, (tx) => tx`SELECT app_revoke_invite_code(${id})`);
      expect((await app`SELECT app_redeem_invite(${h('OLD')}, 'late@x.test') AS r`)[0].r).toBe('invalid');
      expect((await app`SELECT app_may_sign_in('new.artist@x.test') AS ok`)[0].ok).toBe(true);
      expect((await app`SELECT app_may_sign_in('third@x.test') AS ok`)[0].ok).toBe(false);
    });

    it('the first sign-in makes their own workspace, once; onboarding names it and sets its kind', async () => {
      const [{ id: u }] = await app`INSERT INTO users (email) VALUES ('new.artist@x.test') RETURNING id`;
      const [{ t }] = await app`SELECT app_create_workspace(${u}) AS t`;
      expect((await app`SELECT app_create_workspace(${u}) AS t`)[0].t).toBe(t);
      const mine = await memberships(app, u);
      expect(mine.map((m) => [m.name, m.role, m.kind])).toEqual([['My workspace', 'owner', 'artist']]);
      expect(await withTenant(app, { userId: u, tenantId: t }, (tx) => tx`SELECT app_needs_onboarding() AS n`)).toEqual([{ n: true }]);
      expect((await withTenant(app, { userId: u, tenantId: t }, (tx) => tx`SELECT slug FROM departments WHERE phase = 1`)).length).toBe(9);
      await withTenant(app, { userId: u, tenantId: t }, (tx) => tx`SELECT app_apply_onboarding('Kesi Vale Music', 'small_label')`);
      expect((await memberships(app, u))[0]).toMatchObject({ name: 'Kesi Vale Music', kind: 'label' });
      // Nobody else can rename it, and it sees nothing of other labels.
      await expect(withTenant(app, { userId: ids.ua, tenantId: t }, (tx) => tx`SELECT app_apply_onboarding('Mine now', 'solo')`)).rejects.toThrow(/only the workspace/);
      expect(await withTenant(app, { userId: u, tenantId: t }, (tx) => tx`SELECT id FROM approvals`)).toHaveLength(0);
      const [{ none }] = await app`SELECT app_create_workspace(${ids.ua}) AS none`;
      expect(none).toBeNull(); // no sign-up, no workspace
    });
  });
  describe('everyone runs their own workspace', () => {
    it('someone invited only as a payee gets their own workspace once; the label stays a connection', async () => {
      const [{ id: label }] = await owner`INSERT INTO tenants (slug, name, kind) VALUES ('pays-you', 'Pays You Records', 'label') RETURNING id`;
      await owner`INSERT INTO allowlist (email, tenant_id, role) VALUES ('paid@x.test', ${label}, 'payee')`;
      const [{ id: u }] = await app`INSERT INTO users (email) VALUES ('paid@x.test') RETURNING id`;
      await app`SELECT app_claim_invites(${u})`;
      const [{ t }] = await app`SELECT app_create_workspace(${u}) AS t`;
      expect(t).toBeTruthy();
      expect((await app`SELECT app_create_workspace(${u}) AS t`)[0].t).toBeNull(); // once
      const mine = await memberships(app, u);
      expect(mine.map((m) => [m.name, m.role]).sort()).toEqual([['My workspace', 'owner'], ['Pays You Records', 'payee']]);
      expect(await withTenant(app, { userId: u, tenantId: t }, (tx) => tx`SELECT app_needs_onboarding() AS n`)).toEqual([{ n: true }]);
      // The label sees nothing inside it.
      await owner`INSERT INTO memberships (user_id, tenant_id, role) VALUES (${ids.ua}, ${label}, 'owner')`;
      expect(await withTenant(app, { userId: ids.ua, tenantId: t }, (tx) => tx`SELECT app_role() AS r`)).toEqual([{ r: null }]);
      expect(await withTenant(app, { userId: ids.ua, tenantId: t }, (tx) => tx`SELECT 1 FROM label_settings`)).toHaveLength(0);
    });

    it('co-owners and team join the inviter’s workspace only; anyone signed in can start one', async () => {
      const [{ t: none }] = await app`SELECT app_create_workspace(${ids.ua}) AS t`;
      expect(none).toBeNull();
      const [{ id }] = await asUser(app, ids.ua, (tx) => tx`SELECT app_start_workspace() AS id`);
      expect((await memberships(app, ids.ua)).find((m) => m.tenantId === id)).toMatchObject({ name: 'My workspace', role: 'owner' });
      await expect(app`SELECT app_start_workspace()`).rejects.toThrow(/sign in first/);
      await expect(app`SELECT app_open_workspace(${ids.ua}, '{}'::jsonb)`).rejects.toThrow(/permission denied/);
    });
  });
  describe('label services and their clients', () => {
    let svcUser = ''; let svc = '';
    beforeAll(async () => {
      [{ id: svcUser }] = await owner`INSERT INTO users (email) VALUES ('svc@services.test') RETURNING id`;
      [{ id: svc }] = await owner`INSERT INTO tenants (slug, name, kind, signup) VALUES ('svc-co', 'Svc Co', 'artist', true) RETURNING id`;
      await owner`INSERT INTO memberships (user_id, tenant_id, role) VALUES (${svcUser}, ${svc}, 'owner')`;
    });

    it('finishing onboarding as label services makes the workspace a parent; a client can’t become one', async () => {
      await withTenant(app, { userId: svcUser, tenantId: svc }, (tx) => tx`SELECT app_apply_onboarding('Svc Co', 'services')`);
      expect((await owner`SELECT kind FROM tenants WHERE id = ${svc}`)[0].kind).toBe('licensee');
    });

    it('its owners add clients, each its own workspace, and act as owners inside them', async () => {
      const [{ id: c1 }] = await withTenant(app, { userId: svcUser, tenantId: svc }, (tx) => tx`SELECT app_create_client('Rue Nova', 'artist') AS id`);
      await withTenant(app, { userId: svcUser, tenantId: svc }, (tx) => tx`SELECT app_create_client('Tide Records', 'label')`);
      const list = await withTenant(app, { userId: svcUser, tenantId: svc }, (tx) => tx`SELECT name, kind FROM app_clients()`);
      expect(list.map((r) => [r.name, r.kind])).toEqual([['Rue Nova', 'artist'], ['Tide Records', 'label']]);
      expect((await memberships(app, svcUser)).map((m) => m.name)).toEqual(['Svc Co', 'Rue Nova', 'Tide Records']);
      expect(await withTenant(app, { userId: svcUser, tenantId: c1 }, (tx) => tx`SELECT app_role() AS r`)).toEqual([{ r: 'owner' }]);
      expect((await withTenant(app, { userId: svcUser, tenantId: c1 }, (tx) => tx`SELECT slug FROM departments WHERE phase = 1`)).length).toBe(9);
      // A client is not a parent: it can't add clients of its own, and stays an artist on setup.
      await expect(withTenant(app, { userId: svcUser, tenantId: c1 }, (tx) => tx`SELECT app_create_client('Nested', 'artist')`)).rejects.toThrow(/owners add clients|can't have clients/);
      await withTenant(app, { userId: svcUser, tenantId: c1 }, (tx) => tx`SELECT app_apply_onboarding('Rue Nova', 'services')`);
      expect((await owner`SELECT kind FROM tenants WHERE id = ${c1}`)[0].kind).toBe('artist');
    });

    it('nobody else adds or lists another workspace’s clients, and the defaults helper isn’t the app’s', async () => {
      await expect(withTenant(app, { userId: ids.ua, tenantId: svc }, (tx) => tx`SELECT app_create_client('Mine', 'artist')`)).rejects.toThrow(/owners add clients/);
      expect(await withTenant(app, { userId: ids.ua, tenantId: svc }, (tx) => tx`SELECT * FROM app_clients()`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_create_client('Mine', 'artist')`)).rejects.toThrow(/can't have clients of its own/); // a is a client of lic
      // Any top-level workspace can have clients, not only label services (ONB-01).
      const [{ id: own }] = await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT app_create_client('B client', 'artist') AS id`);
      expect((await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT name FROM app_clients()`)).map((r) => r.name)).toEqual(['B client']);
      await owner`DELETE FROM tenants WHERE id = ${own}`;
      await expect(app`SELECT app_workspace_defaults(${ids.a}, 'x')`).rejects.toThrow(/permission denied/);
    });
  });
  describe('audit flags', () => {
    it('the label’s owners and team read and raise flags; payees and other labels can’t; resolving is the only change', async () => {
      const [rec] = await owner`INSERT INTO recordings (tenant_id, slug, title, artist_id) VALUES (${ids.a}, 'flagged', 'Flagged',
        (SELECT id FROM parties WHERE tenant_id = ${ids.a} LIMIT 1)) RETURNING id`;
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`INSERT INTO audit_flags (tenant_id, recording_id, kind, note) VALUES (${ids.a}, ${rec.id}, 'stream_spike', 'spike')`);
      expect(await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT note FROM audit_flags`)).toEqual([{ note: 'spike' }]);
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT 1 FROM audit_flags`)).toHaveLength(0);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM audit_flags`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE audit_flags SET note = 'changed'`)).rejects.toThrow(/permission denied/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`DELETE FROM audit_flags`)).rejects.toThrow(/permission denied/);
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE audit_flags SET resolved_at = now(), resolved_by = ${ids.ua}, resolution = 'Distributor confirmed'`);
    });
  });
  describe('ISRC and UPC prefixes', () => {
    let partyA2 = '';
    beforeAll(async () => {
      [{ id: partyA2 }] = await owner`INSERT INTO parties (tenant_id, slug, name) VALUES (${ids.a}, 'codes-artist', 'Codes Artist') RETURNING id`;
      await owner`INSERT INTO recordings (tenant_id, slug, title, artist_id) VALUES (${ids.a}, 'no-isrc-1', 'One', ${partyA2}), (${ids.a}, 'no-isrc-2', 'Two', ${partyA2})`;
      await owner`INSERT INTO releases (tenant_id, slug, title, kind, artist_id) VALUES (${ids.a}, 'no-upc', 'No UPC', 'single', ${partyA2})`;
    });

    it('only owners set prefixes; codes come out numbered, never reused, with a right check digit', async () => {
      await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT app_set_code_prefixes('US-ZZ9', '0360002')`)).rejects.toThrow(/only the owners/);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_assign_isrc('no-isrc-1')`)).rejects.toThrow(/set your ISRC prefix/);
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_set_code_prefixes('us-zz9', '036 0002')`);
      const yy = String(new Date().getUTCFullYear() % 100).padStart(2, '0');
      // Someone already uses the first code: it's skipped.
      await owner`INSERT INTO recordings (tenant_id, slug, title, artist_id, isrc) VALUES (${ids.a}, 'taken', 'Taken', ${partyA2}, ${`USZZ9${yy}00001`})`;
      const [{ c1 }] = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_assign_isrc('no-isrc-1') AS c1`);
      const [{ c2 }] = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_assign_isrc('no-isrc-2') AS c2`);
      expect([c1, c2]).toEqual([`USZZ9${yy}00002`, `USZZ9${yy}00003`]);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_assign_isrc('no-isrc-1')`)).rejects.toThrow(/already has an ISRC/);
      const [{ u }] = await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT app_assign_upc('no-upc') AS u`);
      expect(u).toBe('036000200010'); // prefix 0360002, item 0001, check digit 0
      expect((await owner`SELECT gtin_check_digit(left(${u}, -1)) = right(${u}, 1)::int AS ok`)[0].ok).toBe(true);
    });

    it('another label can’t assign codes to your catalog or read your prefixes', async () => {
      await expect(withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT app_assign_isrc('no-isrc-1')`)).rejects.toThrow(/no such recording/);
      expect(await withTenant(app, { userId: ids.ub, tenantId: ids.b }, (tx) => tx`SELECT 1 FROM code_prefixes`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`UPDATE code_prefixes SET isrc_next = 1`)).rejects.toThrow(/permission denied/);
    });
  });
  describe('licensee owners and invitations', () => {
    it('a licensee’s owner acts as an owner in its labels, and in no others', async () => {
      expect(await withTenant(app, { userId: ids.licOwner, tenantId: ids.a }, (tx) => tx`SELECT app_role() AS r`)).toEqual([{ r: 'owner' }]);
      expect((await withTenant(app, { userId: ids.licOwner, tenantId: ids.a }, (tx) => tx`SELECT slug FROM recordings`)).length).toBeGreaterThan(0);
      expect(await withTenant(app, { userId: ids.licOwner, tenantId: ids.b }, (tx) => tx`SELECT app_role() AS r`)).toEqual([{ r: null }]);
      const labels = await memberships(app, ids.licOwner);
      expect(labels.map((m) => [m.slug, m.role])).toEqual([['lic', 'owner'], ['a', 'owner']]);
    });

    it('only owners see and add invitations', async () => {
      await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`INSERT INTO allowlist (email, tenant_id, role) VALUES ('new@x.test', ${ids.a}, 'team')`);
      expect((await withTenant(app, { userId: ids.ua, tenantId: ids.a }, (tx) => tx`SELECT email, joined FROM app_invites()`)).map((r) => r.email)).toContain('new@x.test');
      expect(await withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`SELECT * FROM app_invites()`)).toHaveLength(0);
      await expect(withTenant(app, { userId: ids.payee, tenantId: ids.a }, (tx) => tx`INSERT INTO allowlist (email, tenant_id, role) VALUES ('x@x.test', ${ids.a}, 'owner')`)).rejects.toThrow(/row-level security/);
    });
  });
});
