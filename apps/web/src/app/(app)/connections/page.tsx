import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Page } from '@/components/shell/Page';
import { ConnectionsView } from '@/components/connections/ConnectionsView';
import { authRequired, requireContext } from '@/server/context';

export const metadata: Metadata = { title: 'Labels I work with' };

/** The labels that pay you. Each opens to what your deal with it covers. */
export default async function ConnectionsPage() {
  await connection(); // decided per request, never at build time
  if (!authRequired()) notFound();
  const ctx = await requireContext();
  return <Page><ConnectionsView workspace={ctx.tenantName} labels={ctx.connections.map((c) => ({ id: c.tenantId, name: c.name }))} /></Page>;
}
