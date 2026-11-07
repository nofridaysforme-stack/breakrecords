'use client';

// Draft v5 of the Glasshouse recording split, shared by the splits editor (4a) and the
// payee portal (4f, 4g). Session only, like approvals.
import { useCallback, useEffect, useState } from 'react';
import type { DealTerms } from '@/lib/dealSplit';

const KEY = 'br.split.gh-rec.v5';
const SIG = 'br.split.gh-rec.v5.signatures';

export function useV5() {
  const [sent, setSent] = useState(false);
  const [terms, setTerms] = useState<DealTerms | null>(null);
  const [sigs, setSigs] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); setSent(Boolean(v.sent)); setTerms(v.terms ?? null); }
      const s = sessionStorage.getItem(SIG); if (s) setSigs(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);
  const sign = useCallback((payeeId: string) => {
    setSigs((cur) => {
      const next = { ...cur, [payeeId]: new Date().toISOString().slice(0, 10) };
      try { sessionStorage.setItem(SIG, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { sent, terms, signedBy: (id: string) => sigs[id], signedCount: Object.keys(sigs).length, sign };
}
