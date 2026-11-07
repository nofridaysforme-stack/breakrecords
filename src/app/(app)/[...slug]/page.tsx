import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { Placeholder } from '@/components/placeholder/Placeholder';

// Every route in CLAUDE_CODE_INSTRUCTIONS.md section 2 that a later phase builds.
const routes: Record<string, { title: string; phase: string; frames: string }> = {
  catalog: { title: 'Catalog', phase: 'Phase E · Batch 3', frames: '5a' },
  contracts: { title: 'Contracts', phase: 'Phase E · Batch 3', frames: '5b' },
  rights: { title: 'Rights', phase: 'Phase E · Batch 3', frames: '5c' },
  funding: { title: 'Funding', phase: 'Phase E · Batch 3', frames: '5d, 5e, 5j' },
  roster: { title: 'Roster', phase: 'Phase E · undrawn', frames: 'built from Batch 3 parts' },
  departments: { title: 'Departments', phase: 'Phase E · Batch 3', frames: '5f' },
  activity: { title: 'Activity log', phase: 'Phase E · Batch 3', frames: '5g' },
  settings: { title: 'Settings', phase: 'Phase E · Batch 3', frames: '5h, 5i' },
  help: { title: 'Help', phase: 'Later', frames: 'not drawn' },
};

type Params = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: routes[slug[0]]?.title ?? 'Not found' };
}

export default async function PlaceholderPage({ params }: Params) {
  const { slug } = await params;
  const route = routes[slug[0]];
  if (!route) notFound();
  return (
    <Page>
      <Placeholder title={route.title} phase={route.phase} frames={route.frames} />
    </Page>
  );
}
