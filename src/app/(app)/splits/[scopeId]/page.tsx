import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { SplitsEditor } from '@/components/splits/SplitsEditor';
import type { SplitNode } from '@/components/ui/Splits';
import { getDeal, getSplitTree } from '@/data/api';
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
  const tree = getSplitTree();
  const hit = find(tree, scopeId);
  if (!hit) notFound();
  return (
    <Page bare>
      <SplitsEditor tree={tree} nodeId={scopeId} nodeLabel={hit.node.label} parentLabel={hit.parent?.label ?? null} deal={getDeal(scopeId)} scenario={toScenario((await searchParams).state)} />
    </Page>
  );
}
