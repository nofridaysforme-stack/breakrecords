import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import { toScenario } from '@/data/types';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { RoyaltiesView } from '@/components/money/RoyaltiesView';
import { getRoyalties } from '@/data/api';

export const metadata: Metadata = { title: 'Royalties' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function RoyaltiesPage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return <Page><MoneyTabs /><ScreenState scenario={scenario} copy={STATES.royalties} heading="Royalties"><RoyaltiesView data={await getRoyalties()} /></ScreenState></Page>;
}
