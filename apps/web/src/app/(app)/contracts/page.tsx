import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { ContractsView } from '@/components/contracts/ContractsView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getContracts } from '@/data/api';

export const metadata: Metadata = { title: 'Contracts' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function ContractsPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><ScreenState scenario={scenario} copy={OPS_STATES.contracts} heading="Contracts"><ContractsView data={await getContracts()} /></ScreenState></Page>;
}
