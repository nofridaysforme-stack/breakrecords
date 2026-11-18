// What each agent looks for, as rules over plain facts the runner loads. Each finding links to
// where it's fixed. Rule ids: MET (Metadata Agent), RGT (Rights Agent).

import type { Finding } from './agents';

// ---------- Metadata Agent ----------
export type MetadataFacts = {
  recordings: {
    id: string; title: string; onRelease: boolean; isrc: string | null; genre: string | null; durationS: number | null;
    hasOwner: boolean; pYear: number | null; firstReleaseYear: number | null; aiDeclared: boolean; contributors: number;
  }[];
  people: { id: string; name: string; missing: string[]; onCatalog: boolean }[];
};

const rec = (id: string) => `/catalog/recordings?edit=${encodeURIComponent(id)}`;

export function metadataFindings(f: MetadataFacts): Finding[] {
  const out: Finding[] = [];
  const add = (rule: string, key: string, title: string, detail: string, href: string, extra: Partial<Finding> = {}) =>
    out.push({ dept: 'metadata', rule, key: `metadata:${key}`, title, detail, href, ...extra });
  for (const r of f.recordings) {
    if (!r.isrc) add('MET-01', `isrc:${r.id}`, `${r.title} has no ISRC`, 'Stores, SoundExchange and statements all identify a recording by its ISRC. Get one from your distributor, or assign your own in Catalog.', rec(r.id));
    if (!r.onRelease) continue; // the rest matter once it's going out
    if (!r.genre) add('MET-02', `genre:${r.id}`, `${r.title} has no genre`, 'Stores ask for a genre with every track.', rec(r.id));
    if (!r.durationS) add('MET-03', `length:${r.id}`, `${r.title} has no length`, 'Registrations and label copy list each recording’s length.', rec(r.id));
    if (!r.hasOwner) add('MET-04', `owner:${r.id}`, `Who owns the master of ${r.title} isn’t set`, 'The owner is the ℗ line, and the claimant on copyright and SoundExchange forms.', rec(r.id));
    if (!r.pYear && r.firstReleaseYear) {
      add('MET-05', `pyear:${r.id}`, `${r.title} has no ℗ year`, `It was first released in ${r.firstReleaseYear}, so that’s its ℗ year.`, rec(r.id),
        { fix: { kind: 'set_p_year', args: { recording: r.id, year: r.firstReleaseYear } } });
    }
    if (!r.aiDeclared) add('MET-06', `ai:${r.id}`, `AI use for ${r.title} isn’t declared`, 'Stores now ask whether AI was used in the audio, lyrics or art. "None" is an answer too.', rec(r.id));
    if (!r.contributors) add('MET-07', `credits:${r.id}`, `No one is credited on ${r.title} but the artist`, 'Add the producer, mixer and engineers. They can be paid through a SoundExchange Letter of Direction, and stores show the credits.', rec(r.id));
  }
  for (const p of f.people) {
    if (!p.onCatalog || !p.missing.length) continue;
    add('MET-08', `person:${p.id}`, `${p.name}: ${p.missing.length} ${p.missing.length === 1 ? 'detail' : 'details'} missing for the rights forms`,
      `Missing: ${p.missing.join(', ')}.`, `/catalog/people/${encodeURIComponent(p.id)}`);
  }
  return out;
}

// ---------- Rights Agent ----------
export type RegNext = 'prepare' | 'approve' | 'submitted' | 'confirmed' | null;
export type RightsFacts = {
  songs: { id: string; title: string; released: boolean; pro: RegNext; mlc: RegNext }[];
  recordings: { id: string; title: string; released: boolean; sxOwner: RegNext; sxArtist: RegNext; isrc: boolean }[];
  /** Filings approved but not yet recorded as submitted, with how many days ago they were approved. */
  approvedWaiting: { approvalId: string; title: string; days: number }[];
  unclaimed: { id: string; what: string; source: string; amountCents: number }[];
};

const ORG = { pro: 'their PRO', mlc: 'The MLC', sx_owner: 'SoundExchange (as owner)', sx_artist: 'SoundExchange (as artist)' } as const;

export function rightsFindings(f: RightsFacts): Finding[] {
  const out: Finding[] = [];
  // Open while the filing still needs preparing or deciding; the card is made only when it needs preparing.
  const filing = (rule: string, org: keyof typeof ORG, subject: 'work' | 'recording', id: string, title: string, why: string, next: RegNext) => {
    if (next !== 'prepare' && next !== 'approve') return;
    out.push({ dept: 'rights', rule, key: `rights:${org}:${id}`, title: `${title} isn’t registered with ${ORG[org]}`, detail: why, href: '/rights/registrations',
      ...(next === 'prepare' ? { card: { kind: 'registration', args: { org, subject, id } } } : {}) });
  };
  for (const s of f.songs) {
    if (!s.released) continue;
    filing('RGT-01', 'pro', 'work', s.id, s.title, 'Performance royalties for the song (radio, streaming, live) go unpaid until each writer’s PRO has it.', s.pro);
    filing('RGT-02', 'mlc', 'work', s.id, s.title, 'US streaming mechanicals for the song sit unmatched at The MLC until it’s registered.', s.mlc);
  }
  for (const r of f.recordings) {
    if (!r.released || !r.isrc) continue; // SoundExchange claims recordings by ISRC; Metadata asks for one first
    filing('RGT-03', 'sx_owner', 'recording', r.id, r.title, 'The owner’s share of digital radio royalties (SiriusXM, Pandora, internet radio) waits at SoundExchange.', r.sxOwner);
    filing('RGT-04', 'sx_artist', 'recording', r.id, r.title, 'The featured artist’s share of digital radio royalties waits at SoundExchange.', r.sxArtist);
  }
  for (const a of f.approvedWaiting) {
    if (a.days < 7) continue;
    out.push({ dept: 'rights', rule: 'RGT-05', key: `rights:submit:${a.approvalId}`, title: `${a.title}: approved ${a.days} days ago, not submitted yet`,
      detail: 'Submit it on the organization’s site, then record it as submitted in Rights › Registrations.', href: '/rights/registrations' });
  }
  for (const u of f.unclaimed) {
    out.push({ dept: 'rights', rule: 'RGT-06', key: `rights:unclaimed:${u.id}`, title: `${u.source} is holding money for ${u.what}`,
      detail: 'Prepare a claim for it in Rights › Unclaimed money, or mark it as not yours.', href: '/rights/unclaimed' });
  }
  return out;
}

// ---------- Royalties Agent ----------
// Rule ids ROY-21 and up (ROY-01 to ROY-09 are the approval checks on payout cards).
export type RoyaltiesFacts = {
  /** Unmatched statement lines grouped by reported ISRC, with the recording that has that ISRC now, if any. */
  unmatched: { isrc: string | null; lines: number; cents: number; recording: { id: string; title: string } | null }[];
  /** Releases that earned money in the last 120 days and have no split. */
  unsplit: { id: string; title: string; cents: number }[];
  /** Draft payout batches whose month has ended and that aren't in Approvals yet. */
  draftBatches: { id: string; name: string }[];
};

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function royaltiesFindings(f: RoyaltiesFacts): Finding[] {
  const out: Finding[] = [];
  for (const u of f.unmatched) {
    const what = `${u.lines} statement ${u.lines === 1 ? 'line' : 'lines'} (${usd(u.cents)})`;
    if (u.isrc && u.recording) {
      out.push({ dept: 'royalties', rule: 'ROY-21', key: `royalties:match:${u.isrc.toLowerCase()}`, title: `${what} for ${u.isrc} belong to ${u.recording.title}`,
        detail: 'The ISRC on the statement is this recording’s. Matching them lets the money reach its split.', href: '/money/royalties',
        fix: { kind: 'match_isrc', args: { isrc: u.isrc, recording: u.recording.id } } });
    } else {
      out.push({ dept: 'royalties', rule: 'ROY-22', key: `royalties:unknown:${(u.isrc ?? 'none').toLowerCase()}`,
        title: u.isrc ? `${what} for ${u.isrc} don’t match anything in your catalog` : `${what} have no ISRC`,
        detail: 'They aren’t paid until they’re matched. Add the recording or its ISRC in Catalog, or match them in Royalties.', href: '/money/royalties' });
    }
  }
  for (const r of f.unsplit) {
    out.push({ dept: 'royalties', rule: 'ROY-23', key: `royalties:nosplit:${r.id}`, title: `${r.title} earned ${usd(r.cents)} and has no split`,
      detail: 'Without a split, nobody on it can be paid. Set who gets what in Splits.', href: '/splits' });
  }
  for (const b of f.draftBatches) {
    out.push({ dept: 'royalties', rule: 'ROY-24', key: `royalties:batch:${b.id}`, title: `The ${b.name} payout batch is still a draft`,
      detail: 'Its month has ended. Check it and send it for approval in Payouts.', href: '/money/payouts' });
  }
  return out;
}

// ---------- Audit Agent ----------
// Rule ids AUD-21 and up. The Audit Agent only raises things; holding money is always a person's call.
// (A statement whose lines don't add up to its total is refused by the database at import.)
export type AuditFacts = {
  /** Plays per recording in the latest month on file, and the average of up to 3 months before it. */
  units: { id: string; title: string; latest: number; average: number; months: number; flagged: boolean }[];
  /** Pairs of statements from the same source and month with the same total and line count. */
  duplicates: { a: string; b: string }[];
};

/** A month at least 3 times the usual, and at least 5,000 more plays, needs a look. */
export const SPIKE = { factor: 3, minExtra: 5000 };

export function auditFindings(f: AuditFacts): Finding[] {
  const out: Finding[] = [];
  for (const u of f.units) {
    if (u.flagged || u.months < 1) continue;
    if (u.latest >= u.average * SPIKE.factor && u.latest - u.average >= SPIKE.minExtra) {
      out.push({ dept: 'audit', rule: 'AUD-21', key: `audit:spike:${u.id}`,
        title: `${u.title} jumped to ${u.latest.toLocaleString('en-US')} plays from about ${Math.round(u.average).toLocaleString('en-US')}`,
        detail: 'Sudden spikes can be artificial streams, which stores claw back. If it looks wrong, flag it in Payouts › Reserves to hold its money until you decide.', href: '/money/payouts' });
    }
  }
  for (const d of f.duplicates) {
    out.push({ dept: 'audit', rule: 'AUD-22', key: `audit:duplicate:${d.a.toLowerCase()}:${d.b.toLowerCase()}`, title: `Statements ${d.a} and ${d.b} look like the same statement twice`,
      detail: 'Same source, same month, same total and line count. Importing a statement twice would pay it twice.', href: '/money/royalties' });
  }
  return out;
}
