'use server';

import { cookies } from 'next/headers';
import { signOut } from '../auth';

/** Ends this browser's session and goes to the sign-in page. */
export async function signOutAction() {
  (await cookies()).delete('br_tenant');
  await signOut({ redirectTo: '/sign-in' });
}
