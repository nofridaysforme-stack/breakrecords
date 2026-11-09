import 'server-only';
import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/postgres-js';
import { connect } from '@breakrecords/db/client';
import { sql } from './db';
import { accounts, sessions, users, verificationTokens } from './authSchema';
import { sendSignInLink } from './mail';

const DAY = 24 * 60 * 60;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Sign-in links are built from AUTH_URL. Pin it to the app's public address so a forged Host
// header can never point a link at another site (Trading Platform, spec 15).
if (process.env.APP_URL) process.env.AUTH_URL ??= process.env.APP_URL;

/** On the allowlist, and not a deactivated user. Checked when a link is requested and when it's used. */
export async function mayAccess(email: string): Promise<boolean> {
  const [row] = await sql`SELECT app_may_sign_in(${normalizeEmail(email)}) AS ok`;
  return row?.ok === true;
}

declare global {
  var __brAuthSql: ReturnType<typeof connect> | undefined;
}
// The adapter gets its own pool: Drizzle's postgres.js driver swaps the client's date and
// array serializers for its own, which would break the raw queries that share `sql`.
const authSql = (globalThis.__brAuthSql ??= connect(process.env.DATABASE_URL ?? '', { max: 2 }));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(drizzle({ client: authSql }), { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  // Database sessions, 30-day rolling expiry (as the Trading Platform).
  session: { strategy: 'database', maxAge: 30 * DAY, updateAge: DAY },
  providers: [{
    id: 'email', type: 'email', name: 'Email',
    from: process.env.EMAIL_FROM ?? 'Indie SRVCS <no-reply@example.com>',
    maxAge: 15 * 60, // links expire after 15 minutes and work once
    normalizeIdentifier: normalizeEmail,
    sendVerificationRequest: ({ identifier, url }) => sendSignInLink(identifier, url),
    options: {},
  }],
  pages: { signIn: '/sign-in', verifyRequest: '/sign-in?sent=1', error: '/sign-in' },
  callbacks: {
    async signIn({ user }) { return !!user.email && (await mayAccess(user.email)); },
  },
  events: {
    // Every sign-in turns any pending invitations for this email into memberships.
    async signIn({ user }) { if (user.id) await sql`SELECT app_claim_invites(${user.id})`; },
  },
  trustHost: true,
});
