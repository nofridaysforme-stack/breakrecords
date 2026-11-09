'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { mayAccess, normalizeEmail, signIn } from '@/server/auth';
import { emailConfigured } from '@/server/mail';
import { sql } from '@/server/db';
import { hashInviteCode } from '@/server/inviteCodes';

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

/** Sends the sign-in link once the email is known to be allowed. */
async function sendLink(email: string): Promise<SignInState> {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM verification_tokens WHERE identifier = ${email} AND expires > now()`;
  if (n >= EMAIL_LIMIT) return { error: 'Too many sign-in links requested. Try again in 15 minutes.', email };
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

const clientIp = async () => ((await headers()).get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'local';

export async function requestSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const raw = String(form.get('email') ?? '');
  const parsed = z.email().safeParse(raw.trim());
  if (!parsed.success) return { error: 'Enter an email address, like name@example.com.', email: raw };
  const email = normalizeEmail(parsed.data);
  if (!ipAllowed(await clientIp())) return { error: 'Too many sign-in links requested. Try again in 15 minutes.', email };
  if (!(await mayAccess(email))) return { error: 'This email isn’t invited yet. Sign up with an invite code, or ask whoever runs your team to add you.', email };
  return sendLink(email);
}

export type SignUpState = SignInState & { code?: string };

/** Sign-up with an invite code: the code lets this email in, then the usual sign-in link goes out. */
export async function requestSignUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const code = String(form.get('code') ?? '').trim();
  const raw = String(form.get('email') ?? '');
  const parsed = z.email().safeParse(raw.trim());
  if (!code) return { error: 'Enter your invite code.', email: raw, code };
  if (!parsed.success) return { error: 'Enter an email address, like name@example.com.', email: raw, code };
  const email = normalizeEmail(parsed.data);
  if (!ipAllowed(await clientIp())) return { error: 'Too many tries. Try again in an hour.', email, code };
  const [{ r }] = await sql<{ r: 'ok' | 'invalid' | 'expired' | 'used_up' | 'already' }[]>`SELECT app_redeem_invite(${hashInviteCode(code)}, ${email}) AS r`;
  const why: Record<string, string> = {
    invalid: 'That invite code isn’t valid. Check it and try again.',
    expired: 'That invite code has expired. Ask for a new one.',
    used_up: 'That invite code has been used up. Ask for a new one.',
  };
  if (why[r]) return { error: why[r], email, code };
  return { ...(await sendLink(email)), code };
}
