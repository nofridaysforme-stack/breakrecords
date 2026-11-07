// Recording metadata completeness (5a "Metadata" column and the "N% complete." note).
// Computed from the fields a store or rights body needs, so the score always matches the data.

export type MetadataInput = {
  title: string;
  artist: string | null;
  isrc: string | null;
  durationS: number | null;
  genre: string | null;
  aiUse: 'undeclared' | 'none' | 'partial_stems' | 'partial_vocals' | 'partial_artwork' | 'full';
  /** The song this recording is of. */
  hasSong: boolean;
  iswc: string | null;
  /** Writer shares confirmed and totaling exactly 100.00%. */
  writersConfirmed: boolean;
  hasLyrics: boolean;
  /** Credits beyond the main artist (producer, mixer, players). */
  contributorCredits: number;
  /** On a release with a UPC. */
  upc: string | null;
};

type Check = { key: string; label: string; ok: (m: MetadataInput) => boolean };

/** Twelve checks, equally weighted. Labels read naturally in "Missing the …". */
export const CHECKS: Check[] = [
  { key: 'title', label: 'title', ok: (m) => m.title.trim().length > 0 },
  { key: 'artist', label: 'main artist', ok: (m) => !!m.artist },
  { key: 'isrc', label: 'ISRC', ok: (m) => !!m.isrc },
  { key: 'duration', label: 'duration', ok: (m) => !!m.durationS && m.durationS > 0 },
  { key: 'genre', label: 'genre', ok: (m) => !!m.genre?.trim() },
  { key: 'ai', label: 'AI use declaration', ok: (m) => m.aiUse !== 'undeclared' },
  { key: 'song', label: 'song link', ok: (m) => m.hasSong },
  { key: 'iswc', label: 'ISWC', ok: (m) => !!m.iswc },
  { key: 'writers', label: 'confirmed writer splits', ok: (m) => m.writersConfirmed },
  { key: 'lyrics', label: 'lyrics', ok: (m) => m.hasLyrics },
  { key: 'credits', label: 'contributor credits', ok: (m) => m.contributorCredits > 0 },
  { key: 'release', label: 'release with a UPC', ok: (m) => !!m.upc },
];

export type MetadataScore = { score: number; missing: string[]; note: string };

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Score 0 to 100 (rounded down, so 11 of 12 is 91%, never a flattering 92%), what's missing, and a plain note. */
export function metadataScore(m: MetadataInput, agentNote?: string | null): MetadataScore {
  const missing = CHECKS.filter((c) => !c.ok(m)).map((c) => c.label);
  const score = Math.floor(((CHECKS.length - missing.length) / CHECKS.length) * 100);
  const gap = missing.length ? `Missing the ${list(missing)}.` : 'Nothing missing.';
  return { score, missing, note: agentNote ? `${gap} ${agentNote}` : gap };
}

const AI_LABEL: Record<MetadataInput['aiUse'], string> = {
  undeclared: 'Not declared', none: 'None', partial_stems: 'Partial, stems', partial_vocals: 'Partial, vocals', partial_artwork: 'Partial, artwork', full: 'Full',
};
/** The words the catalog shows for an AI use value, and back. */
export const aiUseLabel = (v: MetadataInput['aiUse']) => AI_LABEL[v];
export const aiUseFromLabel = (label: string): MetadataInput['aiUse'] | null =>
  (Object.entries(AI_LABEL).find(([, l]) => l === label)?.[0] as MetadataInput['aiUse'] | undefined) ?? null;

/** "3:42" from seconds. */
export const formatDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
