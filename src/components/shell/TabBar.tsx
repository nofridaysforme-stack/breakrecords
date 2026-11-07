'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, tabNav } from './nav';
import { useDecisions } from '@/data/decisions';
import s from './TabBar.module.css';

export function TabBar({ approvalIds }: { approvalIds: string[] }) {
  const pathname = usePathname() ?? '/';
  const approvalsCount = useDecisions().openCount(approvalIds);
  return (
    <nav aria-label="Primary" className={s.bar}>
      {tabNav.map((item) => {
        const count = item.badge === 'approvals' ? approvalsCount : 0;
        return (
          <Link key={item.label} href={item.href} className={s.tab} aria-current={isActive(item, pathname) ? 'page' : undefined}>
            <span>
              {item.label}
              {count > 0 && <> <span className="num">{count}</span><span className="visually-hidden"> waiting</span></>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
