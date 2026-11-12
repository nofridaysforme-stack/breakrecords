// Sync licensing rules, shared by the mock and the live server. Pure.
import { formatMoney, type Cents } from './money';
import { formatPercent } from './percent';
import { pctOf } from './splits';

export type SyncMedia = 'film' | 'tv' | 'ad' | 'game' | 'trailer' | 'online' | 'other';
export const MEDIA: Record<SyncMedia, string> = { film: 'Film', tv: 'TV', ad: 'Advertising', game: 'Video game', trailer: 'Trailer', online: 'Online video', other: 'Other' };

/** One fee covers the master and the song. The master's share is rounded to the cent; the song gets exactly the rest. */
export function splitFee(fee: Cents, masterBp: number): { master: Cents; song: Cents } {
  const master = pctOf(fee, masterBp);
  return { master, song: fee - master };
}

/**
 * One-stop: the label can clear both the master and the song itself, which supervisors look
 * for. The master is the label's when it's in the catalog; the song needs signed writer shares
 * totalling 100% and a publishing or admin deal (or the label publishing directly).
 */
export function oneStop(f: { hasSong: boolean; writersConfirmed: boolean; publishingControlled: boolean }): { ok: boolean; note: string } {
  if (!f.hasSong) return { ok: false, note: 'No song is linked, so the song side has to be cleared separately.' };
  if (!f.writersConfirmed) return { ok: false, note: 'The songwriter shares aren’t all confirmed yet.' };
  if (!f.publishingControlled) return { ok: false, note: 'You don’t publish or administer the song, so its publisher has to clear it too.' };
  return { ok: true, note: 'One-stop: you can clear the master and the song.' };
}

export type QuoteState = 'draft' | 'sent' | 'awaiting_signature' | 'licensed' | 'paid' | 'declined';
/** Where a quote stands. Accepting doesn't license anything: the signature card has to be approved. */
export function quoteState(q: { status: 'draft' | 'sent' | 'accepted' | 'declined'; decision: 'approved' | 'rejected' | null; paid: boolean }): QuoteState {
  if (q.status !== 'accepted') return q.status;
  if (q.paid) return 'paid';
  return q.decision === 'approved' ? 'licensed' : 'awaiting_signature';
}

export type LicenseInput = {
  licensor: string; client: string; recording: string; artist: string; isrc: string | null; song: string | null;
  media: SyncMedia; use: string; territory: string; term: string; fee: Cents; masterBp: number; clauses: { title: string; text: string }[]; date: string;
};
/** The license, as headed sections built from the workspace's sync template and the quote. */
export function licenseSections(l: LicenseInput): { title: string; text: string }[] {
  const { master, song } = splitFee(l.fee, l.masterBp);
  const filled: Record<string, string> = {
    Use: `${MEDIA[l.media]}: ${l.use}. Any other use needs a new license.`,
    Fee: `${formatMoney(l.fee)}, one fee for the master (${formatMoney(master)}, ${formatPercent(l.masterBp)}) and the song (${formatMoney(song)}, ${formatPercent(10000 - l.masterBp)}), paid to ${l.licensor} and shared by the splits in place.`,
    'Territory and term': `${l.territory}, ${l.term.toLowerCase()}.`,
  };
  return [
    { title: 'Parties', text: `${l.licensor} (licensor) grants ${l.client} (licensee) the right below, dated ${l.date}.` },
    { title: 'Recording', text: `“${l.recording}” by ${l.artist}${l.isrc ? `, ISRC ${l.isrc}` : ''}${l.song ? `, embodying the song “${l.song}”` : ''}.` },
    ...l.clauses.map((c) => ({ title: c.title, text: filled[c.title] ?? c.text })),
  ];
}
