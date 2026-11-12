import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { ImportView } from '@/components/money/ImportView';
import { listImports } from '@/server/imports';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';

export const metadata: Metadata = { title: 'Import a statement' };

export default async function ImportPage() {
  const ctx = authRequired() && isLive('statements') ? await getContext() : null;
  return <Page><MoneyTabs /><ImportView data={await listImports(ctx)} /></Page>;
}
