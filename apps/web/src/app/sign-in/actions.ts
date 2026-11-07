'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { mayAccess, normalizeEmail, signIn } from '@/server/auth';
import { emailConfigured } from '@/server/mail';
import { sql } from '@/server/db';

export type SignInState = { sent?: boolean; error?: string; email?: string };

// Trading Platform limits: 5 links per email per 15 minutes, 20 per address per hour.
const EMAIL_LIMIT = 5;
const IP_LIMIT = Number(process.env.AUTH_IP_LIMIT) || 20;
const ipHits = new Map<string, number[]>();
function ipAllowed(ip: string) {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= IP_LIMIT) { ipHits.set(ip, recent); return false; }
  ipHits.set(ip, [...recent, now]);
  return true;
}

export async function requestSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const raw = String(form.get('email') ?? '');
  const parsed = z.email().safeParse(raw.trim());
  if (!parsed.success) return { error: 'Enter an email address, like name@example.com.', email: raw };
  const email = normalizeEmail(parsed.data);

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'local';
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM verification_tokens WHERE identifier = ${email} AND expires > now()`;
  if (!ipAllowed(ip) || n >= EMAIL_LIMIT) return { error: 'Too many sign-in links requested. Try again in 15 minutes.', email };
  if (!(await mayAccess(email))) return { error: 'This email isn’t invited yet. Ask your label’s owner to add it.', email };
  if (!emailConfigured()) return { error: 'Email isn’t set up on the server yet, so no link can be sent.', email };
  const failed = { error: 'We couldn’t send the link. Try again in a minute.', email };
  try {
    const to = await signIn('email', { email, redirect: false, redirectTo: '/' });
    if (typeof to === 'string' && new URL(to, 'http://local').searchParams.has('error')) return failed;
  } catch {
    return failed;
  }
  return { sent: true, email };
}
