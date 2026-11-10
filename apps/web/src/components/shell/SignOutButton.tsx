'use client';

import { LogOut } from 'lucide-react';
import { signOutAction } from '@/server/actions/session';

/** Sign out of Indie SRVCS on this browser. */
export function SignOutButton({ className, iconClassName, labelClassName }: { className?: string; iconClassName?: string; labelClassName?: string }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={className} title="Sign out">
        <LogOut className={iconClassName} size={18} aria-hidden="true" />
        <span className={labelClassName}>Sign out</span>
      </button>
    </form>
  );
}
