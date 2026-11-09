'use client';

import { useActionState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestSignUp, type SignUpState } from '../sign-in/actions';
import s from '../sign-in/SignIn.module.css';

export function SignUpForm({ code }: { code?: string }) {
  const [state, action, pending] = useActionState(requestSignUp, { code } as SignUpState);
  return (
    <form action={action} className={s.form} noValidate>
      <label className={s.field} htmlFor="code">Invite code
        <input id="code" name="code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required className={s.input}
          defaultValue={state.code} placeholder="INDIE-XXXX-XXXX" aria-invalid={!!state.error && /code/i.test(state.error)} aria-describedby={state.error ? 'signup-error' : undefined} />
      </label>
      <label className={s.field} htmlFor="email">Email
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className={s.input}
          defaultValue={state.email} aria-invalid={!!state.error && /email/i.test(state.error)} aria-describedby={state.error ? 'signup-error' : undefined} />
      </label>
      {state.error && <p id="signup-error" className={s.error} role="alert"><CircleAlert size={14} strokeWidth={2.5} aria-hidden="true" />{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>Create my account</Button>
      {state.sent && <p role="status" className={s.status}>Check your email for a sign-in link. Opening it sets up your account.</p>}
    </form>
  );
}
