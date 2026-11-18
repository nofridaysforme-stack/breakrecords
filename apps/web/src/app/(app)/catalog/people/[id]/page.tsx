import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { PersonEditor } from '@/components/catalog/People';
import { getPerson } from '@/data/api';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getPerson((await params).id);
  return { title: p ? `${p.name}: details` : 'Not found' };
}

/** One person or company's details for the rights forms. ?back= returns to where a "Fix it" link came from. */
export default async function PersonPage({ params, searchParams }: Props) {
  const p = await getPerson((await params).id);
  if (!p) notFound();
  const { back } = await searchParams;
  return <Page bare><PersonEditor person={p} back={back?.startsWith('/') && !back.startsWith('//') ? back : undefined} /></Page>;
}
