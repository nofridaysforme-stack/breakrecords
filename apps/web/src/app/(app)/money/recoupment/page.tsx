import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import { toScenario } from '@/data/types';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { RecoupmentView } from '@/components/money/RecoupmentView';
import { getRecoupment } from '@/data/api';

export const metadata: Metadata = { title: 'Recoupment' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function RecoupmentPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><MoneyTabs /><ScreenState scenario={scenario} copy={STATES.recoupment} heading="Recoupment"><RecoupmentView items={await getRecoupment()} /></ScreenState></Page>;
}
