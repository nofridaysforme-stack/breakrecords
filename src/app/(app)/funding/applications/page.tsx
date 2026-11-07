import type { Metadata } from 'next';
import { FundingPage } from '@/components/funding/fundingPage';

export const metadata: Metadata = { title: 'Funding applications' };

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  return <FundingPage tab="applications" searchParams={searchParams} />;
}
