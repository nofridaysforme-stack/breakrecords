import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { ActivityView } from '@/components/activity/ActivityView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getActivity } from '@/data/api';

export const metadata: Metadata = { title: 'Activity log' };

type Props = { searchParams: Promise<{ state?: string; open?: string }> };

export default async function ActivityPage({ searchParams }: Props) {
  const q = await searchParams;
  return <Page><ScreenState scenario={toScenario(q.state)} copy={OPS_STATES.activity} heading="Activity log"><ActivityView events={getActivity()} initialOpen={q.open} /></ScreenState></Page>;
}
