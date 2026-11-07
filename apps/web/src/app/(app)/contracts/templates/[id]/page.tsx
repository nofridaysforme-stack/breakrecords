import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { TemplateView } from '@/components/contracts/TemplateView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getContracts, getTemplate } from '@/data/api';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string; draft?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getTemplate((await params).id)?.name ?? 'Template not found' };
}

export default async function TemplatePage({ params, searchParams }: Props) {
  const t = getTemplate((await params).id);
  if (!t) notFound();
  const q = await searchParams;
  const usedIn = getContracts().contracts.filter((c) => c.templateId === t.id);
  return <Page><ScreenState scenario={toScenario(q.state)} copy={OPS_STATES.template} heading={t.name}><TemplateView template={t} usedIn={usedIn} openDraft={q.draft === '1'} /></ScreenState></Page>;
}
