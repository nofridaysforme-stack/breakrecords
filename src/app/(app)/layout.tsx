import { AppShell } from '@/components/shell/AppShell';
import { label, pendingApprovalCount } from '@/data/sample';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell labelName={label.name} approvalsCount={pendingApprovalCount}>
      {children}
    </AppShell>
  );
}
