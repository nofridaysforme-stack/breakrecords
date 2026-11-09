// The Stage 0 gate, run against a deployed environment (staging). Never production.
//   1. Every endpoint in the contract answers on the live API and matches its schema.
//   2. Cross-tenant reads fail: another label, and a payee, get nothing that isn't theirs.
// It signs in the seeded e2e users by creating short-lived database sessions as the owner
// role (no email needed), and deletes them at the end.
//   STAGING_URL=https://… STAGING_OWNER_DATABASE_URL=postgres://… BR_ALLOW_GATE=1 pnpm --filter @breakrecords/web gate
import { randomBytes } from 'node:crypto';
import { ENDPOINTS } from '@breakrecords/contract';
import { connect } from '@breakrecords/db/client';

const base = process.env.STAGING_URL?.replace(/\/$/, '');
const ownerUrl = process.env.STAGING_OWNER_DATABASE_URL;
if (!base || !ownerUrl || process.env.BR_ALLOW_GATE !== '1') {
  console.error('Set STAGING_URL, STAGING_OWNER_DATABASE_URL (owner role) and BR_ALLOW_GATE=1. Staging only, never production.');
  process.exit(1);
}
const cookieName = base.startsWith('https:') ? '__Secure-authjs.session-token' : 'authjs.session-token';
const sql = connect(ownerUrl, { max: 1 });
const tokens: string[] = [];
const failures: string[] = [];
let checks = 0;
const check = (ok: boolean, what: string) => { checks++; if (!ok) failures.push(what); console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`); };

/** A session for a seeded e2e user, as if they had signed in. */
async function sessionFor(email: string): Promise<string> {
  const [u] = await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`;
  await sql`SELECT app_claim_invites(${u.id})`;
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${token}, ${u.id}, now() + interval '15 minutes')`;
  tokens.push(token);
  return token;
}

const get = (token: string, path: string) => fetch(`${base}${path}`, { headers: { cookie: `${cookieName}=${token}` }, redirect: 'manual' });

async function main() {
  const owner = await sessionFor('e2e-owner@northline.example');
  const harbor = await sessionFor('e2e-harbor@harbor.example');
  const payee = await sessionFor('e2e-payee@northline.example');

  // Signed out, nothing is served.
  check((await fetch(`${base}/api/approvals`)).status === 401, 'signed out: the API refuses');

  // 1. Every contract endpoint, live, for Northline's owner.
  for (const e of ENDPOINTS) {
    const res = await get(owner, e.path);
    const body = res.status === 200 ? await res.json() : null;
    const parsed = body ? e.schema.safeParse(body) : null;
    check(res.status === 200 && !!parsed?.success, `${e.path} (${e.module}) matches the contract${res.status !== 200 ? `: HTTP ${res.status}` : parsed && !parsed.success ? `: ${parsed.error.issues[0]?.message}` : ''}`);
  }

  // 2. Cross-tenant: Harbor Sound sees none of Northline's data.
  const catalog = await (await get(harbor, '/api/catalog')).json();
  check(!catalog.recordings.some((r: { id: string }) => r.id === 'glasshouse'), 'another label can’t read Northline’s catalog');
  for (const path of ['/api/approvals/apr_mlc', '/api/statements/ST-2026-10-KV', '/api/releases/rel_glasshouse', '/api/splits/gh-rec', '/api/portal/marco-dela']) {
    check((await get(harbor, path)).status === 404, `another label gets 404 for ${path}`);
  }
  const search = await (await get(harbor, '/api/search?q=glasshouse')).json();
  check(search.items.every((i: { group: string }) => i.group === 'Go to'), 'another label’s search finds nothing of Northline’s');

  // Nothing in the database is reachable except through the app role: Supabase's API roles
  // (anon, authenticated) have no table, sequence or function of ours.
  const [leak] = await sql<{ tables: number; functions: number }[]>`
    SELECT (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')) AS tables,
           (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
                AND (has_function_privilege('public', p.oid, 'EXECUTE')
                  OR (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND has_function_privilege('anon', p.oid, 'EXECUTE')))) AS functions`;
  check(leak.tables === 0 && leak.functions === 0, `only the app role can use the database (API roles: ${leak.tables} tables, ${leak.functions} functions)`);

  // A payee sees only their own.
  for (const path of ['/api/money/royalties', '/api/money/payouts', '/api/contracts', '/api/settings']) {
    check((await get(payee, path)).status === 403, `a payee is refused ${path}`);
  }
  const mine = await (await get(payee, '/api/statements')).json();
  check(mine.items.every((s: { payee: string }) => s.payee === 'Marco Dela'), 'a payee lists only their own statements');
  check((await get(payee, '/api/portal/kesi-vale')).status === 404, 'a payee can’t open another payee’s portal');
}

main()
  .catch((e) => { failures.push(`gate crashed: ${e instanceof Error ? e.message : String(e)}`); })
  .finally(async () => {
    if (tokens.length) await sql`DELETE FROM sessions WHERE session_token = ANY(${tokens})`;
    await sql.end();
    console.log(`\n${checks - failures.length} of ${checks} checks passed.`);
    if (failures.length) { console.log('Failed:\n' + failures.map((f) => `  ${f}`).join('\n')); process.exit(1); }
    console.log('Stage 0 gate: passed.');
  });
