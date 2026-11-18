import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';
import type { ApprovalDetail } from '@/data/types';
import type { Proposal, UnclaimedActionCommand } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { CLAIM_METHOD, claimFacts, claimState, claimSteps, SOURCE_LABEL, type ClaimSource, type ClaimStatus } from '@breakrecords/core/unclaimed';
import { label as LABEL } from '@/data/sample';
import * as ops from '@/data/ops';
import type { Unclaimed } from '@/data/api';
import { mockSession } from './session';

// Sample data: the two held royalties, plus this browser session's claims.
type Row = { status: ClaimStatus; approvalId?: string; submittedOn?: string; submitRef?: string; resolvedOn?: string; paid?: number; resolution?: string };
const g = globalThis as unknown as { __brClaims?: Map<string, Record<string, Row>>; __brClaimDetails?: Map<string, Record<string, ApprovalDetail>>;
  __brApprovals?: Map<string, { decisions: Record<string, { status: string; reason?: string }> }> };
const store = (g.__brClaims ??= new Map());
type Item = (typeof ops.unclaimed.items)[number];
const gf = globalThis as unknown as { __brFound?: Map<string, Item[]> };
const found = (gf.__brFound ??= new Map<string, Item[]>());
const itemsFor = (s: string): Item[] => [...ops.unclaimed.items, ...(found.get(s) ?? [])];
const SHORT: Record<ClaimSource, string> = { soundexchange: 'SoundExchange', mlc: 'MLC', pro: 'PRO' };
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const details = (g.__brClaimDetails ??= new Map());
const sid = async () => (await cookies()).get('br_mock_session')?.value ?? '';
const sourceOf = (s: string): ClaimSource => (s === 'MLC' ? 'mlc' : s === 'PRO' ? 'pro' : 'soundexchange');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function mockUnclaimed(): Promise<Unclaimed> {
  const s = await sid();
  const decisions = g.__brApprovals?.get(s)?.decisions ?? {};
  const items = itemsFor(s).map((u) => {
    const row: Row = store.get(s)?.[u.id] ?? { status: 'found' };
    const d = row.approvalId ? decisions[row.approvalId] : undefined;
    const st = claimState({ status: row.status, approvalId: row.approvalId ?? null, decision: (d?.status as 'approved' | 'rejected' | undefined) ?? null, rejectReason: d?.reason ?? null });
    return { ...u, label: st.label, next: st.next, steps: claimSteps(sourceOf(u.source), u.what), ...(st.note ? { note: st.note } : {}),
      ...(row.approvalId ? { approvalId: row.approvalId } : {}), ...(row.submittedOn ? { submittedOn: row.submittedOn } : {}), ...(row.submitRef ? { submitRef: row.submitRef } : {}),
      ...(row.resolvedOn ? { resolvedOn: row.resolvedOn } : {}), ...(row.paid ? { paid: row.paid } : {}), ...(row.resolution ? { resolution: row.resolution } : {}), open: st.open };
  });
  return { total: items.filter((i) => i.open).reduce((n, i) => n + i.amount, 0), items: items.map(({ open: _o, ...i }) => i) };
}

export async function mockClaimDetail(id: string): Promise<ApprovalDetail | null> {
  return details.get(await sid())?.[id] ?? null;
}

export type MockClaimOutcome = { ok: true } | { ok: false; status: number; error: string; message: string };
export async function mockClaimAction(c: z.infer<typeof UnclaimedActionCommand>, propose: (p: Proposal) => Promise<unknown>): Promise<MockClaimOutcome> {
  const session = await mockSession();
  if (c.action === 'add') {
    const list = found.get(session) ?? [];
    const since = monthYear(c.heldSince);
    if (itemsFor(session).some((x) => x.source === SHORT[c.source] && x.what.toLowerCase() === c.what.toLowerCase() && x.amount === c.amount && x.since === since
      && !['paid', 'dismissed'].includes(store.get(session)?.[x.id]?.status ?? 'found'))) {
      return { ok: false, status: 409, error: 'conflict', message: 'That’s already on the list.' };
    }
    list.push({ id: `found-${list.length + 1}`, source: SHORT[c.source], what: c.what, amount: c.amount, why: c.note || `You found this in ${SOURCE_LABEL[c.source]}’s search.`, since, claim: CLAIM_METHOD[c.source] });
    found.set(session, list);
    return { ok: true };
  }
  const u = itemsFor(session).find((x) => x.id === c.id);
  if (!u) return { ok: false, status: 404, error: 'not_found', message: 'No such unclaimed royalty.' };
  const mine = store.get(session) ?? {};
  const cur: Row = mine[c.id] ?? { status: 'found' };
  const d = cur.approvalId ? g.__brApprovals?.get(session)?.decisions[cur.approvalId] : undefined;
  const st = claimState({ status: cur.status, approvalId: cur.approvalId ?? null, decision: (d?.status as 'approved' | 'rejected' | undefined) ?? null });
  const refuse = (message: string): MockClaimOutcome => ({ ok: false, status: 409, error: 'conflict', message });
  if (!st.open) return refuse(`This claim is already closed (${st.label.toLowerCase()}).`);
  const ok = c.action === 'prepare' ? st.next === 'prepare' : c.action === 'submitted' ? st.next === 'submitted' : c.action === 'paid' ? st.next === 'resolve' : st.next === 'resolve' || st.next === 'prepare';
  if (!ok) {
    if (c.action === 'prepare') return refuse('A claim for this is already waiting on approval or approved.');
    if (c.action === 'submitted') return refuse(st.next === 'approve' ? 'Approve the claim first, then submit it and record it here.' : 'Prepare and approve a claim first.');
    if (c.action === 'paid') return refuse('Record the claim as submitted first.');
    return refuse('Decide the waiting claim card first.');
  }
  const source = sourceOf(u.source);
  if (c.action === 'prepare') {
    const n = Object.keys(details.get(session) ?? {}).filter((k) => k.startsWith(`claim_${c.id}`)).length;
    const id = `claim_${c.id}${n ? `_${n + 1}` : ''}`;
    const title = `Claim ${formatMoney(u.amount)} from ${SOURCE_LABEL[source]}`;
    await propose({ id, type: 'filing', title, agent: 'Rights Agent', due: 'This week', impact: `Claims ${formatMoney(u.amount)}`, risk: 'low', riskLabel: 'Claim', context: 'Unclaimed money', href: '/rights/unclaimed', dept: 'Rights' });
    details.set(session, { ...(details.get(session) ?? {}), [id]: {
      id, type: 'filing', title, agent: 'Rights Agent', due: 'This week', impact: `Claims ${formatMoney(u.amount)}`, risk: 'low', riskLabel: 'Claim', context: 'Unclaimed money', breadcrumb: 'Filing',
      outcome: { text: `If you approve, the claim for ${formatMoney(u.amount)} is ready to submit to ${SOURCE_LABEL[source]}. You submit it on their site, then record it here.` },
      primaryLabel: 'Approve the claim', rejectLabel: 'Reject with reason',
      evidence: { whyLabel: 'Why this claim', why: u.why, inputs: [{ label: 'Unclaimed money', ref: SOURCE_LABEL[source], href: '/rights/unclaimed' }], steps: claimSteps(source, u.what), auditId: 'AUD-CLM-SAMPLE' },
      body: { kind: 'filing', org: SOURCE_LABEL[source], works: [{ title: u.what, writers: formatMoney(u.amount), isrc: `Held since ${u.since}`, iswc: 'Not a song' }], facts: claimFacts(source, u.what, LABEL.name) },
    } as ApprovalDetail });
    mine[c.id] = { status: 'claim_prepared', approvalId: id };
  } else if (c.action === 'submitted') mine[c.id] = { ...cur, status: 'claimed', submittedOn: day(c.on), ...(c.reference ? { submitRef: c.reference } : {}) };
  else if (c.action === 'paid') mine[c.id] = { ...cur, status: 'paid', paid: c.amount, resolvedOn: day(c.on ?? new Date().toISOString().slice(0, 10)) };
  else mine[c.id] = { ...cur, status: 'dismissed', resolution: c.reason, resolvedOn: day(new Date().toISOString().slice(0, 10)) };
  store.set(session, mine);
  return { ok: true };
}
