import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';
import type { ApprovalDetail } from '@/data/types';
import type { Proposal, RegistrationActionCommand } from '@breakrecords/contract';
import { FORM_FOR, ON_WORK, ORG_LABEL, ORGS, REF_LABEL, filingFacts, filingOutcome, regState, type RegOrg, type RegStatus } from '@breakrecords/core/registrations';
import { label as LABEL } from '@/data/sample';
import * as ops from '@/data/ops';
import type { Registrations } from '@/data/api';
import { mockSession } from './session';

// Sample data: the 5c matrix, plus this browser session's filings. The two MLC cells the
// sample's MLC filing card covers are linked to it.
type Row = { status: RegStatus; ref?: string; approvalId?: string; submittedOn?: string; submitRef?: string; confirmedOn?: string };
const g = globalThis as unknown as { __brRegs?: Map<string, Record<string, Row>>; __brRegDetails?: Map<string, Record<string, ApprovalDetail>>;
  __brApprovals?: Map<string, { decisions: Record<string, { status: string; reason?: string }> }> };
const store = (g.__brRegs ??= new Map());
const details = (g.__brRegDetails ??= new Map());
const sid = async () => (await cookies()).get('br_mock_session')?.value ?? '';
const songOf = (recId: string) => {
  const rec = ops.recordings.find((r) => r.id === recId);
  const song = rec ? ops.songs.find((s) => s.title === rec.song) : undefined;
  return song ?? null;
};
const SAMPLE_FILING: Record<string, string> = { 'mlc:night-bus': 'apr_mlc', 'mlc:static-hymn': 'apr_mlc' };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function base(org: RegOrg, subjectId: string): Row | null {
  const row = ON_WORK.has(org) ? ops.registrations.find((r) => songOf(r.id)?.id === subjectId) : ops.registrations.find((r) => r.id === subjectId);
  if (!row) return null;
  const cell = row.cells[ORGS.indexOf(org)];
  return { status: cell.status, ...(cell.ref ? { ref: cell.ref } : {}), ...(SAMPLE_FILING[`${org}:${subjectId}`] ? { approvalId: SAMPLE_FILING[`${org}:${subjectId}`] } : {}) };
}
const rowOf = (session: string, org: RegOrg, subjectId: string) => store.get(session)?.[`${org}:${subjectId}`] ?? base(org, subjectId);

export async function mockRegistrations(): Promise<Registrations> {
  const s = await sid();
  const decisions = g.__brApprovals?.get(s)?.decisions ?? {};
  return {
    columns: ops.regColumns,
    rows: ops.registrations.map((r) => ({
      id: r.id, name: r.name, artist: r.artist,
      cells: ORGS.map((org) => {
        const song = songOf(r.id);
        const target = ON_WORK.has(org) ? (song ? { subject: 'work' as const, id: song.id, title: song.title } : null) : { subject: 'recording' as const, id: r.id, title: r.name };
        const row = target ? rowOf(s, org, target.id) : null;
        const d = row?.approvalId ? decisions[row.approvalId] : undefined;
        const st = regState(row ? { status: row.status, approvalId: row.approvalId ?? null, decision: (d?.status as 'approved' | 'rejected' | undefined) ?? null, rejectReason: d?.reason ?? null } : null);
        return {
          status: st.status, label: st.label, ...(st.note ? { note: st.note } : {}), next: target ? st.next : null, target, form: FORM_FOR[org], refLabel: REF_LABEL[org],
          ...(row?.ref ? { ref: row.ref } : {}), ...(row?.approvalId ? { approvalId: row.approvalId } : {}),
          ...(row?.submittedOn ? { submittedOn: row.submittedOn } : {}), ...(row?.submitRef ? { submitRef: row.submitRef } : {}), ...(row?.confirmedOn ? { confirmedOn: row.confirmedOn } : {}),
        };
      }),
    })),
  };
}

/** A filing card made this session, for its detail page. */
export async function mockRegistrationDetail(id: string): Promise<ApprovalDetail | null> {
  return details.get(await sid())?.[id] ?? null;
}

export type MockRegOutcome = { ok: true } | { ok: false; status: number; error: string; message: string };
export async function mockRegistrationAction(c: z.infer<typeof RegistrationActionCommand>, propose: (p: Proposal) => Promise<unknown>): Promise<MockRegOutcome> {
  if (ON_WORK.has(c.org) !== (c.subject === 'work')) return { ok: false, status: 400, error: 'invalid', message: ON_WORK.has(c.org) ? 'A song registers with that organization, not a recording.' : 'A recording registers with that organization, not a song.' };
  const song = c.subject === 'work' ? ops.songs.find((x) => x.id === c.id) : null;
  const rec = c.subject === 'recording' ? ops.recordings.find((x) => x.id === c.id) : null;
  if (!song && !rec) return { ok: false, status: 404, error: 'not_found', message: 'No such song or recording.' };
  const session = await mockSession();
  const decisions = g.__brApprovals?.get(session)?.decisions ?? {};
  const key = `${c.org}:${c.id}`;
  const cur = rowOf(session, c.org, c.id);
  const d = cur?.approvalId ? decisions[cur.approvalId] : undefined;
  const st = regState(cur ? { status: cur.status, approvalId: cur.approvalId ?? null, decision: (d?.status as 'approved' | 'rejected' | undefined) ?? null } : null);
  const refuse = (message: string): MockRegOutcome => ({ ok: false, status: 409, error: 'conflict', message });
  if (st.next !== c.action) {
    if (c.action === 'prepare') return refuse(st.next === 'approve' ? 'A filing for this is already waiting on approval.' : `This is already ${st.label.toLowerCase()}.`);
    if (c.action === 'submitted') return refuse(st.next === 'approve' ? 'Approve the filing first, then submit it and record it here.' : 'Prepare and approve a filing first.');
    return refuse('Record the submission first.');
  }
  const mine = store.get(session) ?? {};
  const title = song?.title ?? rec!.title;
  if (c.action === 'prepare') {
    const n = Object.keys(details.get(session) ?? {}).filter((k) => k.startsWith(`reg_${c.org}_${c.id}`)).length;
    const id = `reg_${c.org}_${c.id}${n ? `_${n + 1}` : ''}`;
    await propose({ id, type: 'filing', title: `Register ${title} with ${ORG_LABEL[c.org]}`, agent: 'Rights Agent', due: 'This week',
      impact: song ? 'Royalties for the song get paid' : 'Royalties for the recording get paid', risk: 'needsEyes', riskLabel: 'Filing', context: 'Registration', href: '/rights/registrations', dept: 'Rights' });
    const facts = filingFacts(c.org, { title, artist: rec?.artist ?? '', isrc: rec?.isrc ?? null, iswc: song?.iswc ?? null, writers: song?.writers ?? '', owner: rec ? LABEL.name : null }, LABEL.name);
    details.set(session, { ...(details.get(session) ?? {}), [id]: {
      id, type: 'filing', title: `Register ${title} with ${ORG_LABEL[c.org]}`, agent: 'Rights Agent', due: 'This week', impact: song ? 'Royalties for the song get paid' : 'Royalties for the recording get paid',
      risk: 'needsEyes', riskLabel: 'Filing', context: 'Registration', breadcrumb: 'Filing', outcome: { text: filingOutcome(c.org, title) }, primaryLabel: 'Approve the filing', rejectLabel: 'Reject with reason',
      evidence: { whyLabel: 'Why this filing', why: `${title} isn't registered with ${ORG_LABEL[c.org]} yet, so royalties it earns there can go unpaid.`, inputs: [{ label: 'Prepared form', ref: 'Rights › Documents', href: '/rights/documents' }], steps: ['Listed the facts only you can confirm'], auditId: 'AUD-REG-SAMPLE' },
      body: { kind: 'filing', org: ORG_LABEL[c.org], works: [{ title, writers: song?.writers ?? rec!.artist, isrc: rec?.isrc ?? 'None yet', iswc: song?.iswc ?? (song ? 'Assigned after filing' : 'Not a song') }], facts },
    } as ApprovalDetail });
    mine[key] = { status: 'needsYou', approvalId: id };
  } else if (c.action === 'submitted') {
    mine[key] = { ...cur!, status: 'submitted', submittedOn: day(c.on), ...(c.reference ? { submitRef: c.reference } : {}) };
  } else {
    mine[key] = { ...cur!, status: 'confirmed', ref: c.reference, confirmedOn: day(c.on ?? new Date().toISOString().slice(0, 10)) };
  }
  store.set(session, mine);
  return { ok: true };
}
