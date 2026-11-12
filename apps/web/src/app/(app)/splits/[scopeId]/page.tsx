import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { SplitsEditor } from '@/components/splits/SplitsEditor';
import type { SplitNode } from '@/components/ui/Splits';
import { getCatalog, getDeal, getSplitTree, getSplitVersions } from '@/data/api';
import { SplitVersions } from '@/components/splits/SplitVersions';
import { DESIGNED_NODE } from '@/server/splitsRoute';
import { toScenario } from '@/data/types';

export const metadata: Metadata = { title: 'Splits' };

function find(nodes: SplitNode[], id: string, parent: SplitNode | null = null): { node: SplitNode; parent: SplitNode | null } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, parent };
    const hit = n.children && find(n.children, id, n);
    if (hit) return hit;
  }
  return null;
}

type Props = { params: Promise<{ scopeId: string }>; searchParams: Promise<{ state?: string }> };

export default async function SplitsPage({ params, searchParams }: Props) {
  const { scopeId } = await params;
  const tree = await getSplitTree();
  const hit = find(tree, scopeId);
  if (!hit) notFound();
  // Every split but the designed 4a sample uses the versions view: what's in effect, the open
  // version, people per role, new versions and songwriters.
  const versions = scopeId === DESIGNED_NODE ? null : await getSplitVersions(scopeId);
  if (versions) return <Page><SplitVersions key={JSON.stringify([versions.current?.version, versions.open?.version])} data={versions} people={(await getCatalog()).people ?? []} /></Page>;
  return (
    <Page bare>
      <SplitsEditor tree={tree} nodeId={scopeId} nodeLabel={hit.node.label} parentLabel={hit.parent?.label ?? null} deal={await getDeal(scopeId)} scenario={toScenario((await searchParams).state)} />
    </Page>
  );
}
