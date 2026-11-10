import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { ShellUIProvider } from './ShellUI';
import { LabelHeadFab } from './LabelHeadFab';
import { WorkspaceProvider, type WorkspaceKind } from './Workspace';
import s from './AppShell.module.css';

type Props = { children: ReactNode; labelName: string; kind?: WorkspaceKind; staff?: boolean; tenants?: { id: string; name: string; current: boolean }[]; connections?: number; approvalIds: string[] };

/** Sidebar (240px, 64px rail under 1280, hidden under 768) + content + mobile tab bar. */
export function AppShell({ children, labelName, kind = 'label', staff = false, tenants = [], connections = 0, approvalIds }: Props) {
  return (
    <WorkspaceProvider kind={kind}>
    <ShellUIProvider approvalIds={approvalIds}>
      <div className={s.shell}>
        <a href="#main" className={s.skip}>Skip to content</a>
        <Sidebar labelName={labelName} staff={staff} tenants={tenants} connections={connections} approvalIds={approvalIds} />
        <div className={s.content}>{children}</div>
        <LabelHeadFab />
        <TabBar approvalIds={approvalIds} />
      </div>
    </ShellUIProvider>
    </WorkspaceProvider>
  );
}
