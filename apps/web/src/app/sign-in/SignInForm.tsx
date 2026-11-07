'use client';

import { useActionState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestSignInLink, type SignInState } from './actions';
import s from './SignIn.module.css';

export function SignInForm({ initial }: { initial: SignInState }) {
  const [state, action, pending] = useActionState(requestSignInLink, initial);
  return (
    <form action={action} className={s.form} noValidate>
      <label className={s.field} htmlFor="email">Email
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className={s.input}
          defaultValue={state.email} aria-invalid={!!state.error} aria-describedby={state.error ? 'email-error' : undefined} />
      </label>
      {state.error && <p id="email-error" className={s.error} role="alert"><CircleAlert size={14} strokeWidth={2.5} aria-hidden="true" />{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>Email me a sign-in link</Button>
      {state.sent && <p role="status" className={s.status}>Check your email for a sign-in link.</p>}
    </form>
  );
}
