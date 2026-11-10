import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';

export class EmailNotConfiguredError extends Error {}

/** Whether sign-in links can be delivered: Resend is set up, or a test mailbox is in use. */
export function emailConfigured(): boolean {
  return !!process.env.AUTH_TEST_MAILBOX || !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends the sign-in link (Trading Platform pattern). The emailed link opens /sign-in/continue,
 * which asks for one press before using the one-time token, so link previews in message apps
 * can't spend it. With AUTH_TEST_MAILBOX set (tests, local development) the link is written to
 * <mailbox>/<email>.json instead. Links are never logged.
 */
export async function sendSignInLink(email: string, url: string): Promise<void> {
  const callback = new URL(url);
  const link = new URL('/sign-in/continue', callback.origin);
  for (const k of ['token', 'email', 'callbackUrl']) {
    const v = callback.searchParams.get(k);
    if (v) link.searchParams.set(k, v);
  }
  const mailbox = process.env.AUTH_TEST_MAILBOX;
  if (mailbox) {
    await mkdir(mailbox, { recursive: true });
    await writeFile(path.join(mailbox, `${email}.json`), JSON.stringify({ email, url: link.toString(), at: new Date().toISOString() }));
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new EmailNotConfiguredError('Email is not set up yet');
  const { error } = await new Resend(key).emails.send({
    from, to: email,
    subject: 'Your sign-in link for Indie SRVCS',
    text: `Sign in to Indie SRVCS:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  });
  // The reason (never the link) goes to the server log, so a rejected key or sender is easy to spot.
  if (error) throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`);
}

export type InviteEmail = { to: string; workspace: string; role: 'owner' | 'team' | 'payee'; appUrl: string };

/** The invitation's wording. Plain text; no links but the app's own address. */
export function inviteText({ workspace, role, appUrl }: Omit<InviteEmail, 'to'>): { subject: string; text: string } {
  const signIn = `${appUrl.replace(/\/$/, '')}/sign-in`;
  const what = role === 'owner'
    ? `to co-own ${workspace} on Indie SRVCS. You'll run it together, including money and invitations.`
    : role === 'team'
      ? `to join ${workspace}'s team on Indie SRVCS.`
      : `to connect with them on Indie SRVCS. You'll set up your own workspace first (yours, with every tool for your music: catalog, splits, registrations, documents, releases and money). What ${workspace} pays you, your splits and your statements show up in it under Labels I work with.`;
  return {
    subject: `${workspace} invited you to Indie SRVCS`,
    text: `${workspace} invited you ${what}\n\nTo join, open ${signIn} and sign in with this email address. We'll email you a sign-in link.\n\nIf you weren't expecting this, ignore this email.`,
  };
}

/**
 * Emails an invitation. With AUTH_TEST_MAILBOX set it's written to <mailbox>/<email>.invite.json.
 * Returns false (never throws) when email isn't set up or Resend refuses: the invitation still
 * stands, and the person can sign in with that address.
 */
export async function sendInvite(m: InviteEmail): Promise<boolean> {
  const { subject, text } = inviteText(m);
  const mailbox = process.env.AUTH_TEST_MAILBOX;
  try {
    if (mailbox) {
      await mkdir(mailbox, { recursive: true });
      await writeFile(path.join(mailbox, `${m.to}.invite.json`), JSON.stringify({ email: m.to, subject, text, at: new Date().toISOString() }));
      return true;
    }
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) return false;
    const { error } = await new Resend(key).emails.send({ from, to: m.to, subject, text });
    if (error) { console.error(`Resend rejected the invitation email: ${error.name}: ${error.message}`); return false; }
    return true;
  } catch (e) {
    console.error('Invitation email failed', (e as Error).name);
    return false;
  }
}
