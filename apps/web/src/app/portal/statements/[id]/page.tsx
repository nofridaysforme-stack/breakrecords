import { getPortalPayee, getStatement } from '@/data/api';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortalStatement } from '@/components/portal/PortalStatement';

export const metadata: Metadata = { title: 'Statement' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> };

export default async function PortalStatementPage({ params, searchParams }: Props) {
  const p = await getPortalPayee((await searchParams).as);
  const st = await getStatement((await params).id);
  // A payee only ever sees their own statements.
  if (!st || st.payee !== p.name) notFound();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}><PortalStatement st={st} payeeId={p.id} /></div>;
}
