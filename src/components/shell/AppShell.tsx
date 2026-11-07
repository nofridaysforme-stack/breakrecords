import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import s from './AppShell.module.css';

type Props = { children: ReactNode; labelName: string; approvalsCount: number };

/** Sidebar (240px, 64px rail under 1280, hidden under 768) + content + mobile tab bar. */
export function AppShell({ children, labelName, approvalsCount }: Props) {
  return (
    <div className={s.shell}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <Sidebar labelName={labelName} approvalsCount={approvalsCount} />
      <div className={s.content}>{children}</div>
      <TabBar approvalsCount={approvalsCount} />
    </div>
  );
}
