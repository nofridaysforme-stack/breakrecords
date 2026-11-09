import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authRequired, getContext } from '@/server/context';
import { SignUpForm } from './SignUpForm';
import s from '../sign-in/SignIn.module.css';

export const metadata: Metadata = { title: 'Sign up' };

/** Sign-up with an invite code. With sign-in off (sample data), there's nothing to sign up for. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams; // first, so the page is checked on every request
  if (!authRequired() || (await getContext())) redirect('/');
  return (
    <main id="main" className={s.page}>
      <div className={s.card}>
        <p className={s.brand}><span className={s.mark} aria-hidden="true">I</span>Indie SRVCS.</p>
        <h1 className={s.title}>Sign up</h1>
        <p className={s.lede}>Indie SRVCS is invite-only for now. Enter your invite code and email, and we’ll send you a link to get started.</p>
        <SignUpForm code={code} />
        <p className={s.lede}>Already have an account? <Link href="/sign-in" className={s.link}>Sign in</Link></p>
      </div>
    </main>
  );
}
