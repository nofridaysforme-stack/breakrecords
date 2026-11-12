import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { SyncView } from '@/components/sync/SyncView';
import { getSync, syncReader } from '@/server/syncRoute';

export const metadata: Metadata = { title: 'Sync licensing' };

export default async function SyncPage() {
  const who = await syncReader();
  if ('refused' in who) redirect('/');
  return <Page><SyncView data={await getSync(who.ctx)} /></Page>;
}
