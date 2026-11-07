import 'server-only';
import { cookies } from 'next/headers';

const COOKIE = 'br_mock_session';

/**
 * The mock keeps decisions per browser session, as the UI always has. Live replaces this with
 * the signed-in user and tenant from Auth.js.
 */
export async function mockSession(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return id;
}
