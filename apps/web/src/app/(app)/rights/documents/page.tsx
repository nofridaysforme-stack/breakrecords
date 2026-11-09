import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { RightsTabs } from '@/components/rights/RightsViews';
import { DocumentsView } from '@/components/rights/DocumentsView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getDocuments } from '@/data/api';

export const metadata: Metadata = { title: 'Documents' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function DocumentsPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><RightsTabs /><ScreenState scenario={scenario} copy={OPS_STATES.documents} heading="Documents"><DocumentsView data={await getDocuments()} /></ScreenState></Page>;
}
