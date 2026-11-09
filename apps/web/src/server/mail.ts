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
    subject: 'Your sign-in link for Break Records',
    text: `Sign in to Break Records:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  });
  // The reason (never the link) goes to the server log, so a rejected key or sender is easy to spot.
  if (error) throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`);
}
