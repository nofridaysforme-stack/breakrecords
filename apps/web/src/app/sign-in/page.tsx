import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getContext } from '@/server/context';
import { SignInForm } from './SignInForm';
import s from './SignIn.module.css';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  AccessDenied: 'This email isn’t invited yet. Ask your label’s owner to add it.',
  Verification: 'That sign-in link has expired or was already used. Ask for a new one.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  if (await getContext()) redirect('/');
  const p = await searchParams;
  const error = p.error ? (ERRORS[p.error] ?? 'Sign-in didn’t work. Try again.') : undefined;
  return (
    <main id="main" className={s.page}>
      <div className={s.card}>
        <p className={s.brand}><span className={s.mark} aria-hidden="true">I</span>Indie SRVCS.</p>
        <h1 className={s.title}>Sign in</h1>
        <p className={s.lede}>We’ll email you a link. It works once and expires in 15 minutes.</p>
        <SignInForm initial={{ sent: p.sent === '1', error }} />
      </div>
    </main>
  );
}
