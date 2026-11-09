import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { OfferCompare } from '@/components/funding/OfferCompare';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getOffers } from '@/data/api';

export const metadata: Metadata = { title: 'Compare offers' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function ComparePage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  const offers = await getOffers();
  if (!offers) notFound();
  return (
    <Page>
      <ScreenState scenario={scenario} copy={OPS_STATES.offers} heading="Compare offers">
        <OfferCompare assumptions={offers.assumptions} advanceOffer={offers.advance.offer} saleOffer={offers.sale.offer} terms={{ advance: offers.advance.terms, sale: offers.sale.terms }} saleId={offers.sale.id} declined={offers.declined} />
      </ScreenState>
    </Page>
  );
}
