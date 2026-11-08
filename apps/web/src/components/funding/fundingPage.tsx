import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { FundingHead, FundingView, type FundingTab } from './FundingView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getFunding } from '@/data/api';

/** Shared by the three Funding tabs. */
export async function FundingPage({ tab, searchParams }: { tab: FundingTab; searchParams: Promise<{ state?: string }> }) {
  const scenario = toScenario((await searchParams).state);
  const data = await getFunding();
  return <Page><FundingHead data={data} /><ScreenState scenario={scenario} copy={OPS_STATES.funding}><FundingView data={data} tab={tab} /></ScreenState></Page>;
}
