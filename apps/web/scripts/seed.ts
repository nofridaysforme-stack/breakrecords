// Loads the Northline sample world into a database for local development, previews and
// staging. Never production: it refuses unless BR_ALLOW_SEED=1, and it only ever writes the
// sample tenants. Run with the owner connection: SEED_DATABASE_URL=... pnpm db:seed
import { connect } from '@breakrecords/db/client';
import { approvals as items } from '../src/data/sample';
import { approvalDetails } from '../src/data/fixtures';

const url = process.env.SEED_DATABASE_URL;
if (!url || process.env.BR_ALLOW_SEED !== '1') {
  console.error('Set SEED_DATABASE_URL (owner role) and BR_ALLOW_SEED=1. Never run this against production.');
  process.exit(1);
}

// Who can sign in to the sample world. E2E addresses receive links in the test mailbox.
const PEOPLE = (process.env.SEED_EMAILS ?? 'jana@northline.example:northline:owner,e2e-owner@northline.example:northline:owner,e2e-harbor@harbor.example:harbor-sound:owner,e2e-payee@northline.example:northline:payee')
  .split(',').map((s) => { const [email, tenant, role] = s.split(':'); return { email: email.toLowerCase(), tenant, role }; });

const DUE: Record<string, string> = { apr_payout_oct: '2026-11-10', apr_producer: '2026-11-09', apr_mlc: '2026-11-12', apr_grant: '2026-11-15' };

async function main() {
  const sql = connect(url!, { max: 1 });
  await sql.begin(async (tx) => {
    const tenant = async (slug: string, name: string, kind: string, parent: string | null) => {
      const [row] = await tx`INSERT INTO tenants (slug, name, kind, parent_id) VALUES (${slug}, ${name}, ${kind}, ${parent})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id RETURNING id`;
      return row.id as string;
    };
    // 5i: Harbor Sound licenses the platform; Northline Records is one of its sub-tenants.
    const licensee = await tenant('harbor-sound-licensee', 'Harbor Sound', 'licensee', null);
    const ids: Record<string, string> = {
      northline: await tenant('northline', 'Northline Records', 'label', licensee),
      'harbor-sound': await tenant('harbor-sound', 'Harbor Sound', 'label', licensee),
    };

    for (const p of PEOPLE) {
      await tx`INSERT INTO allowlist (email, tenant_id, role) VALUES (${p.email}, ${ids[p.tenant]}, ${p.role}) ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role`;
    }

    // Agent-prepared approvals with what the person is shown, frozen in `detail`.
    await tx`DELETE FROM approvals WHERE tenant_id = ${ids.northline} AND origin = 'agent'`;
    for (const a of items) {
      const d = approvalDetails[a.id];
      const detail = d ? { breadcrumb: d.breadcrumb, outcome: d.outcome, primaryLabel: d.primaryLabel, rejectLabel: d.rejectLabel, evidence: d.evidence, body: d.body } : null;
      await tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, due_on, impact, risk, context, risk_label, detail)
        VALUES (${ids.northline}, ${a.id}, 'agent', ${a.type}, ${a.title}, ${a.agent}, ${a.due}, ${DUE[a.id] ?? null}, ${a.impact}, ${a.risk},
                ${a.context ?? null}, ${a.riskLabel ?? null}, ${detail ? tx.json(detail as never) : null})`;
    }
    // A second label with its own approval, so cross-tenant checks have something to miss.
    await tx`DELETE FROM approvals WHERE tenant_id = ${ids['harbor-sound']} AND origin = 'agent'`;
    await tx`INSERT INTO approvals (tenant_id, id, origin, type, title, agent, due, due_on, impact, risk, context)
      VALUES (${ids['harbor-sound']}, 'apr_harbor_payout', 'agent', 'money', 'Payout batch for October', 'Royalties Agent', 'Nov 12', '2026-11-12', '$842.10 to 4 payees', 'low', 'October statements')`;
  });
  console.log(`Seeded Northline and Harbor Sound; ${PEOPLE.length} people allowlisted.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
