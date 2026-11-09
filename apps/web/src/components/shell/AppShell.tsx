import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { ShellUIProvider } from './ShellUI';
import { LabelHeadFab } from './LabelHeadFab';
import s from './AppShell.module.css';

type Props = { children: ReactNode; labelName: string; tenants?: { id: string; name: string; current: boolean }[]; approvalIds: string[] };

/** Sidebar (240px, 64px rail under 1280, hidden under 768) + content + mobile tab bar. */
export function AppShell({ children, labelName, tenants = [], approvalIds }: Props) {
  return (
    <ShellUIProvider approvalIds={approvalIds}>
      <div className={s.shell}>
        <a href="#main" className={s.skip}>Skip to content</a>
        <Sidebar labelName={labelName} tenants={tenants} approvalIds={approvalIds} />
        <div className={s.content}>{children}</div>
        <LabelHeadFab />
        <TabBar approvalIds={approvalIds} />
      </div>
    </ShellUIProvider>
  );
}
