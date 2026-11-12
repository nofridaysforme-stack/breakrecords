import 'server-only';
import { cookies } from 'next/headers';
import type { Proposal, ReservesResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { heldNote, heldShare, isHeld, reserveStatus, type ReserveOutcome } from '@breakrecords/core/reserves';
import { FLAGGABLE, INCOME, OPEN_LINES, PAST_RESERVES, STATEMENT_SOURCE } from '@/data/reserves';
import { TODAY } from '@/data/fixtures';
import type { payouts, Statement } from '@/data/money';
import { mockSession } from './session';

// Sample-data mode: flags opened and resolved this browser session.
type Flag = { id: string; recordingId: string; note: string; outcome: ReserveOutcome | null; outcomeNote?: string; approvalId?: string };
const g = globalThis as unknown as { __brReserves?: Map<string, Flag[]>; __brApprovals?: Map<string, { decisions: Record<string, { status: string }> }> };
const store = (g.__brReserves ??= new Map());

const sessionId = async () => (await cookies()).get('br_mock_session')?.value ?? null;
const flagsOf = (id: string | null): Flag[] => (id && store.get(id)) || [];
const decisionOf = (id: string | null, approvalId?: string) =>
  (approvalId && id ? g.__brApprovals?.get(id)?.decisions[approvalId]?.status : undefined) as 'approved' | 'rejected' | undefined;
const title = (recordingId: string) => FLAGGABLE.find((r) => r.id === recordingId)?.title ?? recordingId;
const statusOf = (sid: string | null, f: Flag) => reserveStatus({ outcome: f.outcome, releaseDecision: decisionOf(sid, f.approvalId) ?? null });

/** Recordings whose income is held this session. */
function heldTitles(sid: string | null): string[] {
  return flagsOf(sid).filter((f) => isHeld(statusOf(sid, f))).map((f) => title(f.recordingId));
}
function heldFor(titles: string[], release: string, period: string, amount: number) {
  const inc = INCOME[release]?.[period] ?? {};
  const flagged = titles.reduce((a, t) => a + (inc[t] ?? 0), 0);
  const total = Object.values(inc).reduce((a, c) => a + c, 0);
  return { held: heldShare(amount, flagged, total), recordings: titles.filter((t) => (inc[t] ?? 0) > 0) };
}
function heldLines(sid: string | null) {
  const titles = heldTitles(sid);
  return titles.length ? OPEN_LINES.map((l) => ({ ...l, ...heldFor(titles, l.release, l.period, l.amount) })).filter((l) => l.held > 0) : [];
}

/** For the approval checks (ROY-07) on the October batch, by session id. */
export function mockReserveFlags(sid: string, batch: string): { recording: string; note: string; held: boolean; heldCents: number }[] {
  const lines = heldLines(sid).filter((l) => l.batch === batch);
  return flagsOf(sid).filter((f) => isHeld(statusOf(sid, f))).map((f) => {
    const recording = title(f.recordingId);
    return { recording, note: f.note, held: true, heldCents: lines.filter((l) => l.recordings.includes(recording)).reduce((a, l) => a + l.held, 0) };
  }).filter((f) => lines.some((l) => l.recordings.includes(f.recording)));
}

export async function mockReserves(): Promise<ReservesResponse> {
  const sid = await sessionId();
  const lines = heldLines(sid);
  const mine = flagsOf(sid).map((f) => {
    const status = statusOf(sid, f);
    const recording = title(f.recordingId);
    return {
      id: f.id, recording, recordingId: f.recordingId, note: f.note, opened: TODAY.label.replace(/^\w+, /, ''),
      amount: FLAGGABLE.find((r) => r.id === f.recordingId)?.unpaid ?? 0,
      heldNow: isHeld(status) ? lines.filter((l) => l.recordings.includes(recording)).reduce((a, l) => a + l.held, 0) : 0,
      status, ...(f.outcomeNote ? { outcomeNote: f.outcomeNote } : {}), ...(f.approvalId ? { approvalId: f.approvalId } : {}),
    };
  });
  return { items: [...mine.reverse(), ...PAST_RESERVES], recordings: FLAGGABLE.map(({ id, title: t }) => ({ id, title: t })) };
}

export type MockOutcome = { ok: true } | { ok: false; status: number; error: 'not_found' | 'already_flagged' | 'already_decided'; message: string };
export async function mockOpenFlag(recordingId: string, note: string): Promise<MockOutcome> {
  if (!FLAGGABLE.some((r) => r.id === recordingId)) return { ok: false, status: 404, error: 'not_found', message: 'No such recording.' };
  const sid = await mockSession();
  const flags = flagsOf(sid);
  if (flags.some((f) => f.recordingId === recordingId && f.outcome === null)) return { ok: false, status: 409, error: 'already_flagged', message: `${title(recordingId)} is already flagged. Its income is held.` };
  store.set(sid, [...flags, { id: `rsv-${recordingId}-${flags.length + 1}`, recordingId, note, outcome: null }]);
  return { ok: true };
}
export async function mockResolveFlag(id: string, outcome: ReserveOutcome, note: string, propose: (p: Proposal) => Promise<unknown>): Promise<MockOutcome> {
  const sid = await mockSession();
  const flags = flagsOf(sid);
  const f = flags.find((x) => x.id === id);
  if (!f) return PAST_RESERVES.some((r) => r.id === id) ? { ok: false, status: 409, error: 'already_decided', message: 'This flag was already resolved.' } : { ok: false, status: 404, error: 'not_found', message: 'No such reserve.' };
  if (f.outcome) return { ok: false, status: 409, error: 'already_decided', message: 'This flag was already resolved.' };
  let approvalId: string | undefined;
  if (outcome === 'release') {
    const recording = title(f.recordingId);
    const held = heldLines(sid).filter((l) => l.recordings.includes(recording)).reduce((a, l) => a + l.held, 0);
    approvalId = `reserve_${f.id}`;
    await propose({ id: approvalId, type: 'money', title: `Release ${formatMoney(held)} held on ${recording}`, agent: 'Royalties Agent', due: 'Next payout',
      impact: `${formatMoney(held)} goes back into the next batch`, risk: 'needsEyes', riskLabel: 'Reserve release', context: 'Audit flag resolved', href: '/money/payouts#reserves', dept: 'Finance' });
  }
  store.set(sid, flags.map((x) => (x.id === id ? { ...x, outcome, outcomeNote: note, ...(approvalId ? { approvalId } : {}) } : x)));
  return { ok: true };
}

/** 4d with what each unpaid batch holds. */
export async function mockPayoutsHeld(base: typeof payouts): Promise<typeof payouts> {
  const lines = heldLines(await sessionId());
  if (!lines.length) return base;
  return { ...base, batches: base.batches.map((b) => { const h = lines.filter((l) => l.batch === b.id).reduce((a, l) => a + l.held, 0); return h ? { ...b, held: h } : b; }) };
}
/** A statement with the part held in reserve, if any. */
export async function mockStatementHeld(st: Statement): Promise<Statement> {
  const src = STATEMENT_SOURCE[st.id];
  const titles = heldTitles(await sessionId());
  if (!src || !titles.length) return st;
  const h = heldFor(titles, src.release, src.period, st.net);
  return h.held ? { ...st, held: { amount: h.held, note: heldNote(h.held, h.recordings) } } : st;
}
/** Home's "Needs you": flags still waiting on a decision. */
export async function mockHomeReserves() {
  return (await mockReserves()).items.filter((r) => r.status === 'held').map((r) => ({ id: r.id, recording: r.recording, note: r.note, held: r.heldNow }));
}
