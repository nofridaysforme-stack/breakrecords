import 'server-only';
import { connect, type Sql } from '@breakrecords/db/client';

declare global {
  // One pool per process, kept across hot reloads in development.
  var __brSql: Sql | undefined;
}

/** The app's connection, as the br_app role. postgres.js connects on first query, so importing this is safe at build time. */
export const sql: Sql = (globalThis.__brSql ??= connect(process.env.DATABASE_URL ?? ''));
