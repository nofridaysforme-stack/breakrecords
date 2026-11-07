import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { connect } from '@breakrecords/db/client';
import { MAILBOX } from '../../playwright.live.config';

/** Fresh sample world for every run: wipe the test database's rows, then seed. */
export default async function globalSetup() {
  const owner = process.env.TEST_DATABASE_URL;
  if (!owner || !process.env.TEST_APP_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL (owner) and TEST_APP_DATABASE_URL (br_app) for live tests.');
  const sql = connect(owner, { max: 1 });
  await sql`TRUNCATE tenants, users, verification_tokens CASCADE`;
  await sql.end();
  rmSync(MAILBOX, { recursive: true, force: true });
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit', env: { ...process.env, SEED_DATABASE_URL: owner, BR_ALLOW_SEED: '1' } });
}
