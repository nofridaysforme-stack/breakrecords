import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { RightsTabs, RegistrationsView } from '@/components/rights/RightsViews';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getRegistrations, getUnclaimed } from '@/data/api';

export const metadata: Metadata = { title: 'Registrations' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function RightsPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><RightsTabs /><ScreenState scenario={scenario} copy={OPS_STATES.registrations} heading="Registrations"><RegistrationsView data={getRegistrations()} unclaimed={getUnclaimed().total} /></ScreenState></Page>;
}
