import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { CatalogView, type CatalogTab } from '@/components/catalog/CatalogView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getCatalog } from '@/data/api';

const TABS: CatalogTab[] = ['songs', 'recordings', 'releases', 'assets'];
const TITLE: Record<CatalogTab, string> = { songs: 'Songs', recordings: 'Recordings', releases: 'Releases', assets: 'Assets' };

type Props = { params: Promise<{ tab: string }>; searchParams: Promise<{ state?: string; id?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  return { title: `Catalog: ${TITLE[tab as CatalogTab] ?? 'Not found'}` };
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const { tab } = await params;
  if (!TABS.includes(tab as CatalogTab)) notFound();
  const q = await searchParams;
  const scenario = toScenario(q.state);
  const view = <CatalogView data={await getCatalog()} tab={tab as CatalogTab} initialId={q.id} />;
  if (scenario === 'default') return <Page bare>{view}</Page>;
  return <Page><ScreenState scenario={scenario} copy={OPS_STATES.catalog} heading="Catalog">{view}</ScreenState></Page>;
}
