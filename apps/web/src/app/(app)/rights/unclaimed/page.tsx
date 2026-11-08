import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { RightsTabs, UnclaimedView } from '@/components/rights/RightsViews';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getUnclaimed } from '@/data/api';

export const metadata: Metadata = { title: 'Unclaimed money' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function RightsPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><RightsTabs /><ScreenState scenario={scenario} copy={OPS_STATES.unclaimed} heading="Unclaimed money"><UnclaimedView data={await getUnclaimed()} /></ScreenState></Page>;
}
