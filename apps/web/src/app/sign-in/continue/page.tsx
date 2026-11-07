import type { Metadata } from 'next';
import { Button } from '@/components/ui/Button';
import s from '../SignIn.module.css';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Where an emailed link lands. Opening it signs nobody in: message apps open links to draw a
 * preview, which would use up the one-time token. Sign-in happens only on the button press.
 */
export default async function ContinuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const token = p.token ?? ''; const email = p.email ?? '';
  const next = p.callbackUrl ?? '';
  const callbackUrl = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <main id="main" className={s.page}>
      <div className={s.card}>
        <p className={s.brand}><span className={s.mark} aria-hidden="true">B</span>Break Records.</p>
        {token && email ? (
          <form method="get" action="/api/auth/callback/email" className={s.form}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <h1 className={s.title}>Sign in as {email}</h1>
            <p className={s.lede}>This link works once. Press the button to open Break Records.</p>
            <Button type="submit" variant="primary">Sign in</Button>
          </form>
        ) : <p className={s.lede}>This sign-in link is incomplete. Ask for a new one.</p>}
      </div>
    </main>
  );
}
