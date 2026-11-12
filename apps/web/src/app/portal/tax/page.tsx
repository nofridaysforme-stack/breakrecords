import type { Metadata } from 'next';
import { getPortalPayee } from '@/data/api';
import { TaxFormView } from '@/components/portal/TaxFormView';

export const metadata: Metadata = { title: 'Tax forms' };

type Props = { searchParams: Promise<{ as?: string }> };

export default async function TaxPage({ searchParams }: Props) {
  const as = (await searchParams).as;
  const p = await getPortalPayee(as);
  return <TaxFormView key={p.id} p={p} as={as} />;
}
