import { AppShell } from '@/components/shell/AppShell';
import { label } from '@/data/sample';
import { approvalIds } from '@/data/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell labelName={label.name} approvalIds={approvalIds()}>
      {children}
    </AppShell>
  );
}
