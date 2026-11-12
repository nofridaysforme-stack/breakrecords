import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { TaxView } from '@/components/money/TaxView';
import { getTaxYear } from '@/data/api';

export const metadata: Metadata = { title: 'Year-end tax forms' };

type Props = { searchParams: Promise<{ year?: string }> };

export default async function TaxPage({ searchParams }: Props) {
  const raw = (await searchParams).year;
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : 2026;
  const data = await getTaxYear(year);
  return <Page><MoneyTabs /><TaxView key={year} data={data} /></Page>;
}
