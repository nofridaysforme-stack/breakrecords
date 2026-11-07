'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { footerNav, isActive, primaryNav } from './nav';
import { useDecisions } from '@/data/decisions';
import s from './Sidebar.module.css';

type Props = { labelName: string; approvalIds: string[] };

export function Sidebar({ labelName, approvalIds }: Props) {
  const pathname = usePathname() ?? '/';
  const approvalsCount = useDecisions().openCount(approvalIds);

  return (
    <aside className={s.sidebar} aria-label="Sidebar">
      <Link href="/" className={s.brand}>
        <span className={s.mark} aria-hidden="true">B</span>
        <span className={s.wordmark}>Break Records.</span>
        <span className="visually-hidden">, home</span>
      </Link>

      <button type="button" className={s.switcher} aria-haspopup="menu">
        <span>
          <span className={s.switcherKicker}>Label</span>
          <span className={s.switcherName}>{labelName}</span>
          <span className="visually-hidden">, switch label</span>
          <span className={s.switcherInitial} aria-hidden="true">{labelName.charAt(0)}</span>
        </span>
        <ChevronDown className={s.switcherChevron} size={14} aria-hidden="true" />
      </button>

      <nav aria-label="Primary" className={s.nav}>
        {primaryNav.map((item) => {
          const Icon = item.icon;
          if (item.locked) {
            return (
              <div key={item.label} className={`${s.item} ${s.locked}`} aria-disabled="true" title={`${item.label}: Phase 2, coming later`}>
                <span className={s.dot} aria-hidden="true" />
                <Icon className={s.icon} size={20} aria-hidden="true" />
                <span className={s.label}>{item.label}<span className="visually-hidden">, Phase 2, coming later</span></span>
                <span className={s.tag} aria-hidden="true">Phase 2</span>
              </div>
            );
          }
          const active = isActive(item, pathname);
          const count = item.badge === 'approvals' ? approvalsCount : 0;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={s.item}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <span className={s.dot} aria-hidden="true" />
              <Icon className={s.icon} size={20} aria-hidden="true" />
              <span className={s.label}>
                {item.label}
                {count > 0 && <span className="visually-hidden">, {count} waiting</span>}
              </span>
              {count > 0 && <span className={s.badge} aria-hidden="true">{count}</span>}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Secondary" className={s.footer}>
        {footerNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`${s.item} ${s.footerItem}`}
              aria-current={isActive(item, pathname) ? 'page' : undefined}
              title={item.label}
            >
              <Icon className={s.icon} size={18} aria-hidden="true" />
              <span className={s.label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
