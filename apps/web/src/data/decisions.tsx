'use client';

// What the user decided on each approval, this session. Approving here records a
// decision only: nothing is sent, paid, signed or filed by the mock app.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApprovalSummary } from '@/components/ui/Approval';

export type Decision = { status: 'approved' | 'rejected'; at: number; reason?: string };

/** An approval created in the app, such as a release date change sent as a Plan (flows.md). */
export type Proposal = ApprovalSummary & {
  href: string;
  /** Release date changes (2g). */
  releaseId?: string; newDate?: string;
  /** Inbox filters; default to Glasshouse for release plans. */
  artists?: string[]; releases?: string[]; dept?: string;
};

type Store = {
  decisions: Record<string, Decision>;
  proposals: Proposal[];
  approve: (ids: string[]) => void;
  reject: (id: string, reason: string) => void;
  undo: (ids: string[]) => void;
  /** Ids from the given list that still need a decision. */
  pending: (ids: string[]) => string[];
  /** Server approvals plus in-app proposals that still need a decision. */
  openCount: (ids: string[]) => number;
  propose: (p: Proposal) => void;
};

const KEY = 'br.decisions.v1';
const PKEY = 'br.proposals.v1';
const Ctx = createContext<Store | null>(null);

export function DecisionsProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY); if (raw) setDecisions(JSON.parse(raw));
      const p = sessionStorage.getItem(PKEY); if (p) setProposals(JSON.parse(p));
    } catch { /* storage off: start empty */ }
  }, []);
  const save = useCallback((next: Record<string, Decision>) => {
    setDecisions(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const store = useMemo<Store>(() => ({
    decisions,
    approve: (ids) => save({ ...decisions, ...Object.fromEntries(ids.map((id) => [id, { status: 'approved', at: Date.now() }])) }),
    reject: (id, reason) => {
      if (!reason.trim()) throw new Error('A rejection needs a reason');
      save({ ...decisions, [id]: { status: 'rejected', at: Date.now(), reason: reason.trim() } });
    },
    undo: (ids) => { const next = { ...decisions }; ids.forEach((id) => delete next[id]); save(next); },
    pending: (ids) => ids.filter((id) => !decisions[id]),
    openCount: (ids) => ids.filter((id) => !decisions[id]).length + proposals.filter((p) => !decisions[p.id]).length,
    proposals,
    propose: (p) => {
      const next = [...proposals.filter((x) => x.id !== p.id), p];
      setProposals(next);
      // A re-proposed plan needs a fresh decision.
      const d = { ...decisions }; delete d[p.id]; save(d);
      try { sessionStorage.setItem(PKEY, JSON.stringify(next)); } catch { /* ignore */ }
    },
  }), [decisions, proposals, save]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useDecisions(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useDecisions needs <DecisionsProvider>');
  return s;
}
