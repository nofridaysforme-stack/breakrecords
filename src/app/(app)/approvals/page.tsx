import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { InboxView } from '@/components/inbox/InboxView';
import { getApprovals } from '@/data/api';
import { approvalTags, payoutBatch } from '@/data/sample';
import { toScenario } from '@/data/types';

export const metadata: Metadata = { title: 'Approvals' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function ApprovalsPage({ searchParams }: Props) {
  const { scenario, items } = getApprovals(toScenario((await searchParams).state));
  return (
    <Page>
      <InboxView scenario={scenario} items={items.map((a) => ({ ...a, ...approvalTags[a.id] }))} payoutTotal={payoutBatch.total} />
    </Page>
  );
}
