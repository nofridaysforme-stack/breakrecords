import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { OfferCompare } from '@/components/funding/OfferCompare';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { advanceOffer, offerAssumptions, offerTerms, saleOffer } from '@/data/ops';

export const metadata: Metadata = { title: 'Compare offers' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function ComparePage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  return (
    <Page>
      <ScreenState scenario={scenario} copy={OPS_STATES.offers} heading="Compare offers">
        <OfferCompare assumptions={offerAssumptions} advanceOffer={advanceOffer} saleOffer={saleOffer} terms={offerTerms} />
      </ScreenState>
    </Page>
  );
}
