'use client';

// Decisions and in-app proposals, read from and written to the approvals API
// (/api/approvals/*, contract in @breakrecords/contract). The server enforces the rules;
// this mirrors its state so screens update instantly. Approving records a decision only:
// nothing is sent, paid, signed or filed.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ApprovalChecksResponse, ApprovalError, ApprovalState, Decision as DecisionT, Proposal as ProposalT } from '@breakrecords/contract';

export type Decision = DecisionT;
/** An approval created in the app, such as a release date change sent as a Plan (flows.md). */
export type Proposal = ProposalT;

export type Checks = ApprovalChecksResponse['items'][string];

type Store = {
  decisions: Record<string, Decision>;
  proposals: Proposal[];
  /** Each card's checks, from the server (null until loaded). */
  checks: Record<string, Checks> | null;
  /** `acceptWarnings` is the typed reason for approving despite failed Warn checks. */
  approve: (ids: string[], acceptWarnings?: string) => void;
  reject: (id: string, reason: string) => void;
  undo: (ids: string[]) => void;
  /** Ids from the given list that still need a decision. */
  pending: (ids: string[]) => string[];
  /** Server approvals plus in-app proposals that still need a decision. */
  openCount: (ids: string[]) => number;
  propose: (p: Proposal) => void;
};

const Ctx = createContext<Store | null>(null);
const EMPTY: ApprovalState = { decisions: {}, proposals: [] };

type Call = { url: string; method: 'POST' | 'DELETE'; body?: unknown };

export function DecisionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ApprovalState>(EMPTY);
  const [checks, setChecks] = useState<Record<string, Checks> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Writes run one at a time, in order, so a proposal always lands before its approval.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingWrites = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [res, chk] = await Promise.all([fetch('/api/approvals/state', { cache: 'no-store' }), fetch('/api/approvals/checks', { cache: 'no-store' })]);
      if (res.ok) setState(await res.json());
      if (chk.ok) setChecks(((await chk.json()) as ApprovalChecksResponse).items);
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  /** Shows the change at once, then lets the server confirm or refuse it. */
  const write = useCallback((optimistic: (s: ApprovalState) => ApprovalState, call: Call) => {
    setState(optimistic);
    pendingWrites.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch(call.url, {
          method: call.method, keepalive: true,
          headers: call.body ? { 'content-type': 'application/json' } : undefined,
          body: call.body ? JSON.stringify(call.body) : undefined,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError((json as ApprovalError | null)?.message ?? 'That didn’t go through. Nothing was changed.');
          await refresh();
        } else if (pendingWrites.current === 1) {
          // Only the last write in a burst replaces local state, so quick clicks don't flicker.
          setState(json as ApprovalState);
        }
      } catch {
        setError('Couldn’t reach the server. Nothing was changed.');
        await refresh();
      } finally {
        pendingWrites.current -= 1;
      }
    });
  }, [refresh]);

  const store = useMemo<Store>(() => {
    const decide = (ids: string[], d: Decision) => (s: ApprovalState) => ({ ...s, decisions: { ...s.decisions, ...Object.fromEntries(ids.map((id) => [id, d])) } });
    return {
      decisions: state.decisions,
      proposals: state.proposals,
      checks,
      approve: (ids, acceptWarnings) => {
        if (!ids.length) return;
        const reason = acceptWarnings?.trim();
        const optimistic = decide(ids, { status: 'approved', at: Date.now(), ...(reason ? { reason } : {}) });
        if (ids.length === 1) write(optimistic, { url: `/api/approvals/${encodeURIComponent(ids[0])}/decision`, method: 'POST', body: { action: 'approve', ...(reason ? { acceptWarnings: reason } : {}) } });
        else write(optimistic, { url: '/api/approvals/decisions', method: 'POST', body: { action: 'approve', ids } });
      },
      reject: (id, reason) => {
        if (!reason.trim()) throw new Error('A rejection needs a reason');
        write(decide([id], { status: 'rejected', at: Date.now(), reason: reason.trim() }), { url: `/api/approvals/${encodeURIComponent(id)}/decision`, method: 'POST', body: { action: 'reject', reason: reason.trim() } });
      },
      undo: (ids) => {
        if (!ids.length) return;
        const optimistic = (s: ApprovalState) => { const d = { ...s.decisions }; ids.forEach((id) => delete d[id]); return { ...s, decisions: d }; };
        if (ids.length === 1) write(optimistic, { url: `/api/approvals/${encodeURIComponent(ids[0])}/decision`, method: 'DELETE' });
        else write(optimistic, { url: '/api/approvals/decisions', method: 'DELETE', body: { ids } });
      },
      pending: (ids) => ids.filter((id) => !state.decisions[id]),
      openCount: (ids) => ids.filter((id) => !state.decisions[id]).length + state.proposals.filter((p) => !state.decisions[p.id]).length,
      propose: (p) => {
        // A re-proposed plan needs a fresh decision.
        write((s) => { const d = { ...s.decisions }; delete d[p.id]; return { decisions: d, proposals: [...s.proposals.filter((x) => x.id !== p.id), p] }; },
          { url: '/api/approvals', method: 'POST', body: { proposal: p } });
      },
    };
  }, [state, checks, write]);

  return (
    <Ctx.Provider value={store}>
      {children}
      {error && (
        <div role="alert" className="decision-error">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDecisions(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useDecisions needs <DecisionsProvider>');
  return s;
}
