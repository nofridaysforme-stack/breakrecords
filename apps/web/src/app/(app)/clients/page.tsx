import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Page } from '@/components/shell/Page';
import { ClientsView } from '@/components/clients/ClientsView';
import { authRequired, requireContext } from '@/server/context';

export const metadata: Metadata = { title: 'Clients' };

/** The artists and labels you run releases for, each in their own workspace. Any workspace can have clients. */
export default async function ClientsPage() {
  await connection(); // decided per request, never at build time
  // Sample data has no client workspaces; the page still explains what Clients is for.
  if (!authRequired()) return <Page><ClientsView initial={{ clients: [], canAdd: false, clientOf: null }} sample /></Page>;
  const ctx = await requireContext();
  if (ctx.role !== 'owner') notFound();
  const { liveClients } = await import('@/server/live/clients');
  return <Page><ClientsView initial={await liveClients(ctx)} /></Page>;
}
