import 'server-only';
import { cookies } from 'next/headers';
import type { Proposal, SyncResponse } from '@breakrecords/contract';
import { formatMoney } from '@breakrecords/core/money';
import { licenseSections, MEDIA, oneStop, quoteState, splitFee, type SyncMedia } from '@breakrecords/core/sync';
import { recordings, templates } from '@/data/ops';
import { TODAY } from '@/data/fixtures';
import { mockSession } from './session';

// Sample-data mode: briefs and quotes made this browser session.
type Quote = { id: string; recordingId: string; fee: number; masterBp: number; use: string; status: 'draft' | 'sent' | 'accepted' | 'declined'; approvalId?: string; paidRef?: string };
type Brief = { id: string; title: string; client: string; media: SyncMedia; territory: string; term: string; budget: number | null; due: string | null; notes: string | null; quotes: Quote[] };
const g = globalThis as unknown as { __brSync?: Map<string, Brief[]>; __brApprovals?: Map<string, { decisions: Record<string, { status: string }> }> };
const store: Map<string, Brief[]> = (g.__brSync ??= new Map());
const sid = async () => (await cookies()).get('br_mock_session')?.value ?? null;
const read = async (): Promise<Brief[]> => { const id = await sid(); return (id && store.get(id)) || []; };
const decision = (s: string | null, a?: string) => (a && s ? (g.__brApprovals?.get(s)?.decisions[a]?.status as 'approved' | 'rejected' | undefined) ?? null : null);
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brief';
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function mockSync(): Promise<SyncResponse> {
  const s = await sid();
  const briefs = await read();
  return {
    briefs: briefs.map((b) => ({
      id: b.id, title: b.title, client: b.client, media: b.media, territory: b.territory, term: b.term, budget: b.budget, due: b.due ? longDay(b.due) : null, notes: b.notes, closed: false,
      quotes: b.quotes.map((q) => {
        const r = recordings.find((x) => x.id === q.recordingId)!;
        return { id: q.id, recordingId: q.recordingId, recording: r.title, artist: r.artist, fee: q.fee, masterBp: q.masterBp, ...splitFee(q.fee, q.masterBp), use: q.use,
          state: quoteState({ status: q.status, decision: decision(s, q.approvalId), paid: !!q.paidRef }), ...(q.approvalId ? { approvalId: q.approvalId } : {}), ...(q.paidRef ? { paidRef: q.paidRef } : {}) };
      }),
    })),
    // The sample label administers its writers' songs, so a recording with a song is one-stop.
    recordings: recordings.map((r) => {
      const o = oneStop({ hasSong: r.song !== 'No song linked', writersConfirmed: true, publishingControlled: true });
      return { id: r.id, title: r.title, artist: r.artist, oneStop: o.ok, oneStopNote: o.note };
    }),
  };
}

export type MockSyncOutcome = { ok: true } | { ok: false; status: number; error: string; message: string };
async function write(change: (b: Brief[]) => void) {
  const id = await mockSession();
  const list = store.get(id) ?? [];
  change(list);
  store.set(id, list);
}

export async function mockCreateBrief(c: { title: string; client: string; media: SyncMedia; territory?: string; term?: string; budget?: number; due?: string; notes?: string }): Promise<MockSyncOutcome> {
  await write((list) => {
    let id = slugify(c.title);
    for (let i = 2; list.some((b) => b.id === id); i++) id = `${slugify(c.title)}-${i}`;
    list.unshift({ id, title: c.title, client: c.client, media: c.media, territory: c.territory ?? 'Worldwide', term: c.term ?? 'In perpetuity', budget: c.budget ?? null, due: c.due ?? null, notes: c.notes || null, quotes: [] });
  });
  return { ok: true };
}

export async function mockCreateQuote(briefId: string, c: { recordingId: string; fee: number; masterBp?: number; use: string }): Promise<MockSyncOutcome> {
  const b = (await read()).find((x) => x.id === briefId);
  if (!b) return { ok: false, status: 404, error: 'not_found', message: 'No such brief.' };
  if (!recordings.some((r) => r.id === c.recordingId)) return { ok: false, status: 404, error: 'not_found', message: 'No such recording.' };
  if (b.quotes.some((q) => q.recordingId === c.recordingId)) return { ok: false, status: 409, error: 'already_quoted', message: 'That recording is already quoted for this brief.' };
  await write((list) => { list.find((x) => x.id === briefId)!.quotes.push({ id: `q-${briefId}-${c.recordingId}`, recordingId: c.recordingId, fee: c.fee, masterBp: c.masterBp ?? 5000, use: c.use, status: 'draft' }); });
  return { ok: true };
}

export async function mockQuoteAction(id: string, action: 'send' | 'accept' | 'decline' | 'paid', propose: (p: Proposal) => Promise<unknown>): Promise<MockSyncOutcome> {
  const briefs = await read();
  const b = briefs.find((x) => x.quotes.some((q) => q.id === id));
  const q = b?.quotes.find((x) => x.id === id);
  if (!b || !q) return { ok: false, status: 404, error: 'not_found', message: 'No such quote.' };
  const refuse = (message: string) => ({ ok: false as const, status: 409, error: 'not_allowed', message });
  if (action === 'send' && q.status !== 'draft') return refuse('Only a draft quote can be sent.');
  if ((action === 'accept' || action === 'decline') && q.status !== 'sent') return refuse('Mark the quote sent first. Only a sent quote is accepted or declined.');
  if (action === 'paid' && (q.status !== 'accepted' || decision(await sid(), q.approvalId) !== 'approved')) return refuse('The license has to be signed (its approval card approved) before the fee is recorded.');
  if (action === 'paid' && q.paidRef) return refuse('This fee is already recorded.');
  const r = recordings.find((x) => x.id === q.recordingId)!;
  let approvalId: string | undefined;
  if (action === 'accept') {
    approvalId = `sync_${q.id}`;
    await propose({ id: approvalId, type: 'signature', title: `Sign sync license: ${r.title} for ${b.client}`, agent: 'Legal Agent', due: 'This week',
      impact: `${formatMoney(q.fee)} license fee`, risk: 'needsEyes', riskLabel: 'Signature', context: 'Sync license', href: `/sync#${b.id}`, dept: 'Legal' });
  }
  await write((list) => {
    const x = list.find((y) => y.id === b.id)!.quotes.find((y) => y.id === id)!;
    if (action === 'send') x.status = 'sent';
    if (action === 'decline') x.status = 'declined';
    if (action === 'accept') { x.status = 'accepted'; x.approvalId = approvalId; }
    if (action === 'paid') x.paidRef = `SYNC-${TODAY.iso.slice(2, 4)}${TODAY.iso.slice(5, 7)}-${id.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  });
  return { ok: true };
}

export async function mockLicense(id: string) {
  const briefs = await read();
  const b = briefs.find((x) => x.quotes.some((q) => q.id === id));
  const q = b?.quotes.find((x) => x.id === id);
  if (!b || !q) return null;
  const r = recordings.find((x) => x.id === q.recordingId)!;
  const signed = q.status === 'accepted' && decision(await sid(), q.approvalId) === 'approved';
  return {
    signed, title: `Sync license: ${r.title} for ${b.client}`, media: MEDIA[b.media],
    sections: licenseSections({ licensor: 'Northline Records', client: b.client, recording: r.title, artist: r.artist, isrc: r.isrc, song: r.song === 'No song linked' ? null : r.song,
      media: b.media, use: q.use, territory: b.territory, term: b.term, fee: q.fee, masterBp: q.masterBp, clauses: templates.find((t) => t.id === 'sync')?.clauses ?? [], date: longDay(TODAY.iso) }),
  };
}
