import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { PlanView } from '@/components/plan/PlanView';
import { LivePlanView } from '@/components/plan/LivePlanView';
import { getPlanDraft, getPlans, TODAY } from '@/data/api';

export const metadata: Metadata = { title: 'Plan' };

type Props = { searchParams: Promise<{ goal?: string }> };

export default async function PlanPage({ searchParams }: Props) {
  const goal = ((await searchParams).goal ?? '').trim().slice(0, 200);
  const plans = await getPlans();
  // A live workspace plans from what its agents found; sample data keeps its drafted example plans.
  if (plans.live) return <Page><LivePlanView key={goal} goal={goal} draft={goal ? await getPlanDraft(goal) : null} plans={plans.plans} /></Page>;
  return <Page><PlanView key={goal} goal={goal} today={TODAY.iso} /></Page>;
}
