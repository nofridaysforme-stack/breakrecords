import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import { toScenario } from '@/data/types';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { PayoutsView } from '@/components/money/PayoutsView';
import { getPayouts } from '@/data/api';

export const metadata: Metadata = { title: 'Payouts' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function PayoutsPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><MoneyTabs /><ScreenState scenario={scenario} copy={STATES.payouts} heading="Payouts"><PayoutsView data={await getPayouts()} /></ScreenState></Page>;
}
