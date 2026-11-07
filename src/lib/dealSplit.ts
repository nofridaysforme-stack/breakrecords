// The Glasshouse deal as editable terms (4a). Shares of total income are derived:
//   producer points come off the top; label and artist split what is left (net profit);
//   the feature takes a percentage of the artist share.
// Derived sub-shares round down; the remainder stays with the artist (the party the rule names).
import { FULL, type Bp } from './percent';

export type DealTerms = {
  producerBp: Bp;          // 300 = 3 points
  labelOfNetBp: Bp;        // 5000 = 50% of net profit
  artistOfNetBp: Bp;       // 5000
  featureOfArtistBp: Bp;   // 1000 = 10% of the artist share
};

export type DerivedShares = {
  producer: Bp; label: Bp; artist: Bp; feature: Bp;
  /** Unassigned share of net profit (what the header reports). */
  gapOfNetBp: Bp;
  /** The same gap as a share of total income (what the bar and legend show). */
  gapOfTotalBp: Bp;
};

export function deriveShares(t: DealTerms): DerivedShares {
  const net = FULL - t.producerBp;
  const label = Math.round((net * t.labelOfNetBp) / FULL);
  const artistAll = Math.round((net * t.artistOfNetBp) / FULL);
  const feature = Math.floor((artistAll * t.featureOfArtistBp) / FULL);
  const gapOfNetBp = FULL - t.labelOfNetBp - t.artistOfNetBp;
  return {
    producer: t.producerBp, label, artist: artistAll - feature, feature,
    gapOfNetBp,
    gapOfTotalBp: FULL - t.producerBp - label - artistAll,
  };
}
