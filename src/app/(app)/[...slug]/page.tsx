import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { Placeholder } from '@/components/placeholder/Placeholder';

// Every route in CLAUDE_CODE_INSTRUCTIONS.md section 2 that a later phase builds.
const routes: Record<string, { title: string; phase: string; frames: string }> = {
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
