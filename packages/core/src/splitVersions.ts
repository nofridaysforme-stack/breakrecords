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
  /**
   * Line → ISO date signed. A line is a role ("producer") on a version with one party per role,
   * or a role and a party ("artist:kesi-vale") when a role has several people.
   */
  signed: Partial<Record<string, string>>;
  /** The lines on this version, each of which signs. All four roles, one party each, when left out. */
  roles?: string[];
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
export function sign(v: VersionState, role: string, onDate: string): SplitOutcome {
  const roles: string[] = v.roles ?? SPLIT_ROLES;
  if (!roles.includes(role)) return { ok: false, error: 'not_a_party', message: 'That isn’t a party to this split.' };
  if (v.status !== 'sent') return { ok: false, error: 'not_sent', message: 'This version isn’t out for signatures.' };
  if (v.signed[role]) return { ok: false, error: 'already_signed', message: 'Already signed.' };
  const signed = { ...v.signed, [role]: onDate };
  const all = roles.every((r) => signed[r]);
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

/** The line key for a party in a role: just the role when it's the only one, else role and party. */
export const lineKey = (role: SplitRole, party: string, alone: boolean) => (alone ? role : `${role}:${party}`);

export type Line = { role: SplitRole; party: string; shareBp: number };

/** Each role's people and their shares of it: every role present sums to 100%, and there is one label. */
export function checkLines(lines: Line[]): string | null {
  if (lines.filter((l) => l.role === 'label').length !== 1) return 'A split has exactly one label.';
  if (!lines.some((l) => l.role === 'artist')) return 'A split needs at least one artist.';
  const seen = new Set<string>();
  for (const l of lines) {
    if (!Number.isInteger(l.shareBp) || l.shareBp < 1 || l.shareBp > 10000) return 'Each person’s share of their role is between 0.01% and 100%.';
    const k = `${l.role}:${l.party}`;
    if (seen.has(k)) return 'Someone is listed twice in the same role.';
    seen.add(k);
  }
  for (const role of SPLIT_ROLES) {
    const rs = lines.filter((l) => l.role === role);
    if (rs.length && rs.reduce((a, l) => a + l.shareBp, 0) !== 10000) return `The ${role === 'feature' ? 'featured artists’' : `${role}s’`} shares must total 100%.`;
  }
  return null;
}

/**
 * What each line gets from 10000 (that is, from every $100.00 in cents), splitting each role's
 * amount by the people's shares. Rounding remainders go to the first person in the role, so
 * nothing is dropped.
 */
export function lineAmounts(terms: DealTerms, lines: Line[]): number[] {
  const role = deriveShares(terms);
  const out = lines.map((l) => Math.floor((role[l.role] * l.shareBp) / 10000));
  for (const r of SPLIT_ROLES) {
    const idx = lines.map((l, i) => (l.role === r ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const given = idx.reduce((a, i) => a + out[i], 0);
    out[idx[0]] += role[r] - given;
  }
  return out;
}
