import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { PlanView } from '@/components/plan/PlanView';
import { TODAY } from '@/data/api';

export const metadata: Metadata = { title: 'Plan' };

type Props = { searchParams: Promise<{ goal?: string }> };

export default async function PlanPage({ searchParams }: Props) {
  const goal = ((await searchParams).goal ?? '').slice(0, 200);
  return <Page><PlanView key={goal} goal={goal} today={TODAY.iso} /></Page>;
}
