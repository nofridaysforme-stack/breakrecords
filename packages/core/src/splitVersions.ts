// Split versions (Splits spec > Rules engine): a node's split is a versioned rule. A draft can
// be edited until it is sent; it can only be sent when it totals exactly 100%; it takes effect
// once every party has signed, and the version it replaces is superseded. Shares owed under an
// unsigned version wait in suspense. Pure rules, shared by the mock and the live server.
import { deriveShares, type DealTerms } from './dealSplit';

export type SplitRole = 'producer' | 'label' | 'artist' | 'feature';
export const SPLIT_ROLES: SplitRole[] = ['producer', 'label', 'artist', 'feature'];
export type SplitStatus = 'draft' | 'sent' | 'in_effect' | 'superseded';

export type VersionState = {
  status: SplitStatus;
  terms: DealTerms;
  /** Role → ISO date signed. */
  signed: Partial<Record<SplitRole, string>>;
};

export type SplitErrorCode = 'invalid_terms' | 'not_draft' | 'not_100' | 'not_sent' | 'already_signed' | 'not_a_party';
export type SplitOutcome = { ok: true; state: VersionState; tookEffect: boolean } | { ok: false; error: SplitErrorCode; message: string };

const KEYS: (keyof DealTerms)[] = ['producerBp', 'labelOfNetBp', 'artistOfNetBp', 'featureOfArtistBp'];

/** Every term is a whole number of basis points between 0 and 10000; producer points stay at or under 10%. */
export function validTerms(t: DealTerms): string | null {
  for (const k of KEYS) {
    const v = t[k];
    if (!Number.isInteger(v) || v < 0 || v > 10000) return `${k} must be a whole number of basis points from 0 to 10000.`;
  }
  if (t.producerBp > 1000) return 'Producer points above 10 are outside any deal this platform supports.';
  if (t.labelOfNetBp + t.artistOfNetBp > 10000) return 'Label and artist together can’t exceed 100% of net profit.';
  return null;
}

/** Edits a draft. Sent, in-effect and superseded versions never change. */
export function editDraft(v: VersionState, terms: DealTerms): SplitOutcome {
  if (v.status !== 'draft') return { ok: false, error: 'not_draft', message: 'This version is out for signatures. Make a new version to change it.' };
  const bad = validTerms(terms);
  if (bad) return { ok: false, error: 'invalid_terms', message: bad };
  return { ok: true, state: { ...v, terms }, tookEffect: false };
}

/** Sends a draft for signatures, only if every share of net profit is assigned. */
export function send(v: VersionState): SplitOutcome {
  if (v.status !== 'draft') return { ok: false, error: 'not_draft', message: 'Already sent. Waiting on signatures.' };
  const gap = deriveShares(v.terms).gapOfNetBp;
  if (gap !== 0) return { ok: false, error: 'not_100', message: `This split doesn’t total 100%. Assign the missing ${gap / 100}% of net profit first.` };
  return { ok: true, state: { ...v, status: 'sent', signed: {} }, tookEffect: false };
}

/** Records one party's signature. The last signature puts the version in effect. */
export function sign(v: VersionState, role: SplitRole, onDate: string): SplitOutcome {
  if (!SPLIT_ROLES.includes(role)) return { ok: false, error: 'not_a_party', message: 'That isn’t a party to this split.' };
  if (v.status !== 'sent') return { ok: false, error: 'not_sent', message: 'This version isn’t out for signatures.' };
  if (v.signed[role]) return { ok: false, error: 'already_signed', message: 'Already signed.' };
  const signed = { ...v.signed, [role]: onDate };
  const all = SPLIT_ROLES.every((r) => signed[r]);
  return { ok: true, state: { ...v, signed, status: all ? 'in_effect' : 'sent' }, tookEffect: all };
}

export const signedCount = (v: Pick<VersionState, 'signed'>) => SPLIT_ROLES.filter((r) => v.signed[r]).length;

/**
 * Market-range note for producer points (Splits spec: market-range warnings). Indie singles
 * usually pay producers 2 to 4 points; the note is neutral and says where this one sits.
 */
export const PRODUCER_RANGE = { lowBp: 200, highBp: 400, verified: 'Oct 28, 2026' };
export function producerMarketNote(producerBp: number, producer: string): string {
  const pts = producerBp / 100;
  const first = producer.split(' ')[0];
  const where = producerBp < PRODUCER_RANGE.lowBp ? `${first}’s ${pts} is below that range.`
    : producerBp > PRODUCER_RANGE.highBp ? `${first}’s ${pts} is above that range.` : `${first}’s ${pts} is in range.`;
  return `Producer points are usually 2 to 4 on an indie single. ${where} Points are taken before the net profit split, so they reduce both shares.`;
}
