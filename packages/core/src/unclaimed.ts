// Unclaimed money: royalties a society is holding that may be the label's. A claim is a filing:
// prepare it (an approval card), approve it, submit it on the society's site and record that,
// then record what was paid, or that it wasn't ours. Pure; the database enforces the order.

export type ClaimSource = 'soundexchange' | 'mlc' | 'pro';
export type ClaimStatus = 'found' | 'claim_prepared' | 'claimed' | 'paid' | 'dismissed';
export const SOURCE_LABEL: Record<ClaimSource, string> = { soundexchange: 'SoundExchange', mlc: 'The MLC', pro: 'PRO' };

export type ClaimRow = { status: ClaimStatus; approvalId: string | null; decision: 'approved' | 'rejected' | null; rejectReason?: string | null };

/** What a claim shows and what to do next. Rejected cards can be prepared again. */
export function claimState(r: ClaimRow): { label: string; next: 'prepare' | 'approve' | 'submitted' | 'resolve' | null; open: boolean; note?: string } {
  if (r.status === 'paid') return { label: 'Paid', next: null, open: false };
  if (r.status === 'dismissed') return { label: 'Not ours', next: null, open: false };
  if (r.status === 'claimed') return { label: 'Claim submitted', next: 'resolve', open: true };
  if (r.approvalId && r.decision === 'approved') return { label: 'Approved, ready to submit', next: 'submitted', open: true };
  if (r.approvalId && r.decision === 'rejected') return { label: 'Claim rejected', next: 'prepare', open: true, note: r.rejectReason ? `Rejected: ${r.rejectReason}` : 'The claim was rejected.' };
  if (r.approvalId) return { label: 'Waiting on your approval', next: 'approve', open: true };
  return { label: 'Found', next: 'prepare', open: true };
}

/** How each society releases held money, from what each one publishes (docs/RIGHTS_REQUIREMENTS.md). */
export function claimSteps(source: ClaimSource, what: string): string[] {
  switch (source) {
    case 'soundexchange': return [
      'Sign in to SoundExchange Direct: the master owner and the featured artist each claim their own share.',
      `Search the recording by ISRC and claim it (${what}). The SoundExchange registration form in Rights › Documents has the details.`,
      'Record the claim here as submitted, with any reference SoundExchange gives.',
    ];
    case 'mlc': return [
      'In The MLC Member Hub, register the song first if it isn’t registered (the MLC registration form in Rights › Documents).',
      'Then use the Claiming Tool to claim your share, and the Matching Tool to connect its recordings by ISRC.',
      'Record the claim here as submitted, with The MLC’s reference.',
    ];
    case 'pro': return [
      'Register the song with the writer’s PRO if it isn’t (the PRO registration form in Rights › Documents).',
      'Ask the PRO how to claim the held royalties for it; each PRO handles this its own way.',
      'Record the claim here as submitted, with their reference.',
    ];
  }
}

/** The facts a person confirms before a claim goes out. */
export const claimFacts = (source: ClaimSource, what: string, labelName: string): string[] => [
  `${what} belongs to ${labelName} or the people it acts for.`,
  `Nobody else has been paid for it by ${SOURCE_LABEL[source]} (a claim for money already paid out is refused).`,
  'The song and recording details on file are correct.',
];
