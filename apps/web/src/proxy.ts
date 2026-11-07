import { NextResponse, type NextRequest } from 'next/server';

// With sign-in on (BR_AUTH=required), requests without a session cookie stop here: pages go
// to /sign-in, API calls get 401. This is a fast first check only; every page and live API
// route still validates the session itself (src/server/context.ts).
const OPEN = ['/sign-in', '/api/auth', '/_next', '/favicon'];

export function proxy(req: NextRequest) {
  if (process.env.BR_AUTH !== 'required') return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))) return NextResponse.next();
  const hasSession = req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token');
  if (hasSession) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized', message: 'Sign in to continue.' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/sign-in'; url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
