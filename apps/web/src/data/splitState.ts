'use client';

// The Glasshouse v5 split as the payee portal sees it (4f, 4g): read from and signed through
// the splits API, so a signature is saved on the server (per session in sample-data mode,
// in Postgres when live). Same interface the portal used when this lived in the browser.
import { useCallback, useEffect, useState } from 'react';
import type { SplitNodeResponse } from '@breakrecords/contract';
import type { DealTerms } from '@breakrecords/core/dealSplit';

const NODE = 'gh-rec';
/** Which line of the split each sample payee signs. */
const ROLE: Record<string, 'producer' | 'artist'> = { marco: 'producer', kesi: 'artist' };

export function useV5() {
  const [deal, setDeal] = useState<SplitNodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/splits/${NODE}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setDeal).catch(() => setDeal(null));
  }, []);

  // The version the label asked people to sign: out for signatures, or just put in effect by the last signature.
  const asked = deal?.v5?.status === 'sent' ? deal.v5 : deal && !deal.v5 && deal.v4.version >= 5 ? deal.v4 : null;
  const nameOf = (payeeId: string) => (deal && ROLE[payeeId] ? deal.parties[ROLE[payeeId]] : undefined);

  const sign = useCallback(async (payeeId: string) => {
    const role = ROLE[payeeId];
    if (!role) return;
    const res = await fetch(`/api/splits/${NODE}/sign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
    const json = await res.json().catch(() => null);
    if (res.ok) { setDeal(json); setError(null); } else setError(json?.message ?? 'Your signature didn’t save. Try again.');
  }, []);

  return {
    loaded: deal !== null,
    sent: !!asked,
    terms: (asked?.terms ?? null) as DealTerms | null,
    signedBy: (payeeId: string) => { const n = nameOf(payeeId); return n ? asked?.signed[n] : undefined; },
    signedCount: Object.keys(asked?.signed ?? {}).length,
    sign,
    error,
  };
}
