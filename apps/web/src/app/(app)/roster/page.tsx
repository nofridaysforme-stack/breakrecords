import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { RosterView } from '@/components/roster/RosterView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getRoster } from '@/data/api';

export const metadata: Metadata = { title: 'Roster' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function RosterPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><ScreenState scenario={scenario} copy={OPS_STATES.roster} heading="Roster"><RosterView artists={await getRoster()} /></ScreenState></Page>;
}
