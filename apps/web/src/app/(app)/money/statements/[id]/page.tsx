import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { StatementView } from '@/components/money/StatementView';
import { getStatement } from '@/data/api';
import { toScenario } from '@/data/types';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const st = await getStatement((await params).id);
  return { title: st ? `${st.payee}, ${st.period}` : 'Statement not found' };
}

export default async function StatementPage({ params, searchParams }: Props) {
  const st = await getStatement((await params).id);
  if (!st) notFound();
  return <Page bare><StatementView st={st} scenario={toScenario((await searchParams).state)} /></Page>;
}
