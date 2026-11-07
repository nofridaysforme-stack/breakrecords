import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { RunbookView } from '@/components/runbook/RunbookView';
import { getRelease } from '@/data/api';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ change?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = getRelease((await params).id);
  return { title: r ? `${r.title} runbook` : 'Release not found' };
}

export default async function ReleasePage({ params, searchParams }: Props) {
  const r = getRelease((await params).id);
  if (!r) notFound();
  const change = (await searchParams).change;
  return (
    <Page bare>
      <RunbookView release={r} initialChange={change && /^\d{4}-\d{2}-\d{2}$/.test(change) ? change : undefined} />
    </Page>
  );
}
