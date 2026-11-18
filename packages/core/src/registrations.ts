// Registrations: where each song and recording is registered so it gets paid, and how a filing
// moves along. Prepare a filing (an approval card), approve it, submit it on the organization's
// own site and record that, then record the confirmation with its number. Pure; the database
// enforces the same order.
import type { DocKind } from './documents';

export const ORGS = ['pro', 'mlc', 'sx_owner', 'sx_artist', 'copyright', 'neighboring'] as const;
export type RegOrg = (typeof ORGS)[number];
export type RegStatus = 'notStarted' | 'prepared' | 'needsYou' | 'submitted' | 'confirmed' | 'blocked';

export const ORG_LABEL: Record<RegOrg, string> = {
  pro: 'PRO', mlc: 'The MLC', sx_owner: 'SoundExchange (master owner)', sx_artist: 'SoundExchange (featured artist)', copyright: 'US Copyright Office', neighboring: 'Neighboring rights outside the US',
};
/** Songs register with PROs and The MLC; recordings with the rest. */
export const ON_WORK: ReadonlySet<RegOrg> = new Set(['pro', 'mlc']);
/** The prepared form for each registration (Rights › Documents). Neighboring rights have none yet. */
export const FORM_FOR: Record<RegOrg, DocKind | null> = {
  pro: 'pro_registration', mlc: 'mlc_registration', sx_owner: 'sx_registration', sx_artist: 'sx_registration', copyright: 'copyright_worksheet', neighboring: null,
};
/** What the organization calls its confirmation number. */
export const REF_LABEL: Record<RegOrg, string> = {
  pro: 'Work ID', mlc: 'MLC song code', sx_owner: 'SoundExchange reference', sx_artist: 'SoundExchange reference', copyright: 'Registration number', neighboring: 'Reference',
};

export type Decision = 'approved' | 'rejected' | null;
export type RegRow = { status: RegStatus; approvalId: string | null; decision: Decision; rejectReason?: string | null };

/** What a cell shows: the stored status, read through its filing card's decision. */
export function regState(r: RegRow | null): { status: RegStatus; label: string; next: 'prepare' | 'approve' | 'submitted' | 'confirmed' | null; note?: string } {
  if (!r) return { status: 'notStarted', label: 'Not started', next: 'prepare' };
  if (r.status === 'confirmed') return { status: 'confirmed', label: 'Confirmed', next: null };
  if (r.status === 'submitted') return { status: 'submitted', label: 'Submitted', next: 'confirmed' };
  if (r.approvalId) {
    if (r.decision === 'approved') return { status: 'prepared', label: 'Approved, ready to submit', next: 'submitted' };
    if (r.decision === 'rejected') return { status: 'notStarted', label: 'Filing rejected', next: 'prepare', note: r.rejectReason ? `Rejected: ${r.rejectReason}` : 'The filing was rejected.' };
    return { status: 'needsYou', label: 'Waiting on your approval', next: 'approve' };
  }
  if (r.status === 'blocked') return { status: 'blocked', label: 'Blocked', next: 'prepare' };
  return { status: r.status, label: r.status === 'prepared' ? 'Prepared' : r.status === 'needsYou' ? 'Needs you' : 'Not started', next: 'prepare' };
}

export type FilingSubject = { title: string; artist: string; isrc: string | null; iswc: string | null; writers: string; owner: string | null };

/** The facts a person confirms before a filing goes out (the card's checkboxes). */
export function filingFacts(org: RegOrg, s: FilingSubject, labelName: string): string[] {
  switch (org) {
    case 'pro': case 'mlc': return [
      `${s.title} was written by the people listed, with these shares: ${s.writers || 'none on file'}.`,
      'The shares match the signed split sheet.',
      `${labelName} registers only the shares it controls, or the writers asked it to register for them.`,
      `${s.title} isn't already registered with ${org === 'pro' ? 'the PRO' : 'The MLC'} (search first; claim it if it is).`,
    ];
    case 'sx_owner': return [`${s.owner ?? 'The master owner'} owns the master of ${s.title}.`, `The ISRC ${s.isrc ?? '(none yet)'} is this recording's.`];
    case 'sx_artist': return [`${s.artist} is the featured artist on ${s.title}.`, `The ISRC ${s.isrc ?? '(none yet)'} is this recording's.`];
    case 'copyright': return [`The authors listed created ${s.title}, and it wasn't made for hire unless the form says so.`, `${s.owner ?? 'The claimant'} owns the copyright.`, `${s.title} hasn't been registered with the Copyright Office before.`];
    case 'neighboring': return [`${s.artist} performs on ${s.title}, and ${s.owner ?? 'the owner'} owns the master.`];
  }
}

/** One short line for the card: what approving means. */
export const filingOutcome = (org: RegOrg, title: string) =>
  `If you approve, ${title} is ready to register with ${ORG_LABEL[org]}. You submit it on their site with the prepared form, then record it here.`;
