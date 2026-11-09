import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Page } from '@/components/shell/Page';
import { ClientsView } from '@/components/clients/ClientsView';
import { authRequired, requireContext } from '@/server/context';

export const metadata: Metadata = { title: 'Clients' };

/** Label services: the artists and labels you run releases for, each in their own workspace. */
export default async function ClientsPage() {
  await connection(); // decided per request, never at build time
  if (!authRequired()) notFound();
  const ctx = await requireContext();
  if (ctx.tenantKind !== 'licensee' || ctx.role !== 'owner') notFound();
  const { liveClients } = await import('@/server/live/clients');
  return <Page><ClientsView initial={await liveClients(ctx)} /></Page>;
}
