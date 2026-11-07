'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import s from './Portal.module.css';

const ITEMS = [
  { label: 'Earnings', short: 'Earnings', href: '/portal' },
  { label: 'Statements', short: 'Statements', href: '/portal/statements' },
  { label: 'Tax forms', short: 'Tax', href: '/portal/tax' },
  { label: 'Profile', short: 'Profile', href: '/portal/profile' },
];

const isOn = (path: string, href: string) => (href === '/portal' ? path === '/portal' : path.startsWith(href));

/** Top nav on desktop (4f); the phone tab bar is 4 items: Earnings, Statements, Tax, Profile (4g). */
export function PortalNav({ phone }: { phone?: boolean }) {
  const path = usePathname() ?? '';
  const as = useSearchParams()?.get('as');
  const q = as ? `?as=${encodeURIComponent(as)}` : '';
  return (
    <nav aria-label="Portal" className={phone ? s.tabbar : s.nav}>
      {ITEMS.map((i) => (
        <Link key={i.href} href={`${i.href}${q}`} className={phone ? s.tab : s.navItem} aria-current={isOn(path, i.href) ? 'page' : undefined}>
          {phone ? i.short : i.label}
        </Link>
      ))}
    </nav>
  );
}
