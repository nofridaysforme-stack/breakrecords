import 'server-only';
import { cookies } from 'next/headers';
import type { FirstSplitResponse, Recording, SplitNodeResponse, SplitTreeNode } from '@breakrecords/contract';
import { isIsrc, normalizeIsrc } from '@breakrecords/core/codes';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { editDraft, send, sign, validTerms, type SplitOutcome, type SplitRole, type VersionState } from '@breakrecords/core/splitVersions';
import { recordings as sampleRecordings } from '@/data/ops';
import { TODAY } from '@/data/fixtures';
import { mockSession } from './session';

// Sample-data mode: releases, people and splits added this browser session.
type Release = { id: string; title: string; kind: 'single' | 'ep' | 'album'; artistId: string; artist: string; date: string | null; tracks: { id: string; title: string; isrc: string | null }[] };
type Split = { node: string; releaseId: string; title: string; artist: string; parties: Partial<Record<SplitRole, { id: string; name: string }>>; artistIsMe: boolean; state: VersionState; created: string };
type State = { releases: Release[]; people: { id: string; name: string }[]; splits: Split[] };
const g = globalThis as unknown as { __brMusic?: Map<string, State> };
const store = (g.__brMusic ??= new Map());
const empty = (): State => ({ releases: [], people: [], splits: [] });

async function read(): Promise<State> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || empty();
}
async function write(change: (s: State) => void): Promise<void> {
  const id = await mockSession();
  const s = store.get(id) ?? empty();
  change(s);
  store.set(id, s);
}

const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
const unique = (base: string, taken: Set<string>) => { let s = base; for (let i = 2; taken.has(s); i++) s = `${base}-${i}`; return s; };
const KIND = { single: 'Single', ep: 'EP', album: 'Album' } as const;
const SAMPLE_PEOPLE = [{ id: 'kesi-vale', name: 'Kesi Vale' }, { id: 'the-low-hours', name: 'The Low Hours' }, { id: 'marco-dela', name: 'Marco Dela' }, { id: 'ari-monroe', name: 'Ari Monroe' }];
const LABEL = 'Northline Records';
const dateLabel = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set');

/** The sample catalog with this session's releases, the people to pick from, and releases with no split. */
export async function mockMusic() {
  const s = await read();
  const people = [...SAMPLE_PEOPLE, ...s.people];
  const recordings: Recording[] = s.releases.flatMap((r) => r.tracks.map((t) => ({
    id: t.id, title: t.title, artist: r.artist, isrc: t.isrc, score: 40, ai: 'Not declared', duration: 'Not set', upc: null, song: 'No song linked', iswc: null, genre: null,
    credits: [{ name: r.artist, role: 'Primary artist' }], note: 'New: add the song, writers, genre and AI use to finish its metadata.',
  })));
  const releases = s.releases.map((r) => ({ id: r.id, title: r.title, artist: r.artist, kind: KIND[r.kind], date: dateLabel(r.date), upc: 'Not assigned', tracks: r.tracks.length }));
  const unsplit = s.releases.filter((r) => !s.splits.some((x) => x.releaseId === r.id)).map((r) => ({ id: r.id, title: r.title, artist: r.artist }));
  return { recordings, releases, people, unsplit };
}

export type MusicOutcome<T = null> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string };

export async function mockCreateRelease(c: { title: string; kind: 'single' | 'ep' | 'album'; artist: { partyId: string } | { name: string; group?: boolean }; releaseDate?: string; tracks: { title: string; isrc?: string }[] }): Promise<MusicOutcome> {
  const s = await read();
  const isrcs = c.tracks.map((t) => (t.isrc ? normalizeIsrc(t.isrc) : null));
  const bad = isrcs.find((i) => i && !isIsrc(i));
  if (bad) return { ok: false, status: 400, error: 'invalid', message: `${bad} isn’t a valid ISRC (like US-ABC-26-00001).` };
  const used = new Set([...sampleRecordings.map((r) => r.isrc), ...s.releases.flatMap((r) => r.tracks.map((t) => t.isrc))].filter(Boolean));
  const dup = isrcs.find((i) => i && used.has(i));
  if (dup) return { ok: false, status: 409, error: 'duplicate', message: `${dup} is already on another recording.` };
  const people = [...SAMPLE_PEOPLE, ...s.people];
  let artist: { id: string; name: string } | undefined;
  if ('partyId' in c.artist) {
    const id = c.artist.partyId;
    artist = people.find((p) => p.id === id);
    if (!artist) return { ok: false, status: 404, error: 'not_found', message: 'No such artist in this workspace.' };
  }
  await write((st) => {
    if (!artist) {
      const name = (c.artist as { name: string }).name;
      artist = { id: unique(slugify(name), new Set([...SAMPLE_PEOPLE, ...st.people].map((p) => p.id))), name };
      st.people.push(artist);
    }
    const taken = new Set(['rel_glasshouse', 'rel_nightbus', 'rel_velvet', ...st.releases.map((r) => r.id)]);
    const recTaken = new Set([...sampleRecordings.map((r) => r.id), ...st.releases.flatMap((r) => r.tracks.map((t) => t.id))]);
    st.releases.push({
      id: unique(slugify(c.title), taken), title: c.title, kind: c.kind, artistId: artist.id, artist: artist.name, date: c.releaseDate ?? null,
      tracks: c.tracks.map((t, i) => { const id = unique(slugify(t.title), recTaken); recTaken.add(id); return { id, title: t.title, isrc: isrcs[i] }; }),
    });
  });
  return { ok: true, value: null };
}

type PartyInput = { partyId: string } | { name: string };
export async function mockCreateSplit(c: { releaseId: string; producer?: PartyInput; feature?: PartyInput; artistIsMe?: boolean; terms: DealTerms }): Promise<MusicOutcome<string>> {
  const s = await read();
  const rel = s.releases.find((r) => r.id === c.releaseId);
  if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' };
  if (s.splits.some((x) => x.releaseId === rel.id)) return { ok: false, status: 409, error: 'already_split', message: `${rel.title} already has a split. Open it from Splits.` };
  const bad = validTerms(c.terms);
  if (bad) return { ok: false, status: 400, error: 'invalid_terms', message: bad };
  let node = '';
  await write((st) => {
    const who = (p?: PartyInput) => {
      if (!p) return undefined;
      if ('partyId' in p) return [...SAMPLE_PEOPLE, ...st.people].find((x) => x.id === p.partyId);
      const person = { id: unique(slugify(p.name), new Set([...SAMPLE_PEOPLE, ...st.people].map((x) => x.id))), name: p.name };
      st.people.push(person);
      return person;
    };
    node = unique(`${slugify(rel.title)}-recording`, new Set(st.splits.map((x) => x.node)));
    const parties: Split['parties'] = { label: { id: 'northline-records', name: LABEL }, artist: { id: rel.artistId, name: rel.artist } };
    const producer = who(c.producer); const feature = who(c.feature);
    if (producer) parties.producer = producer;
    if (feature) parties.feature = feature;
    st.splits.push({ node, releaseId: rel.id, title: rel.title, artist: rel.artist, parties, artistIsMe: !!c.artistIsMe, created: TODAY.iso,
      state: { status: 'draft', terms: c.terms, signed: {}, roles: Object.keys(parties) as SplitRole[] } });
  });
  return { ok: true, value: node };
}

/** This session's split nodes, added to the sample tree under the label. */
export async function mockTreeWithSplits(tree: SplitTreeNode[]): Promise<SplitTreeNode[]> {
  const s = await read();
  if (!s.splits.length) return tree;
  const [root, ...rest] = tree;
  const artists = [...(root.children ?? [])];
  for (const x of s.splits) {
    const rel = s.releases.find((r) => r.id === x.releaseId)!;
    const leaf = { id: x.node, label: 'Recording income', override: true };
    const relNode = { id: `${x.node}-release`, label: `${rel.title} (${rel.kind === 'ep' ? 'EP' : rel.kind})`, children: [leaf] };
    const i = artists.findIndex((a) => a.label === x.artist);
    if (i >= 0) artists[i] = { ...artists[i], children: [...(artists[i].children ?? []), relNode] };
    else artists.push({ id: `${slugify(x.artist)}-artist`, label: x.artist, children: [relNode] });
  }
  return [{ ...root, children: artists }, ...rest];
}

const ORDER: SplitRole[] = ['artist', 'label', 'producer', 'feature'];
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function mockFirstSplit(node: string): Promise<FirstSplitResponse | null> {
  const x = (await read()).splits.find((y) => y.node === node);
  if (!x || x.state.status === 'in_effect' || x.state.status === 'superseded') return null;
  return {
    node, title: x.title, breadcrumb: [x.artist, x.title, 'Recording income'], version: 1, status: x.state.status, terms: x.state.terms, effective: longDay(x.created),
    parties: ORDER.filter((r) => x.parties[r]).map((role) => ({
      role, name: x.parties[role]!.name, partyId: x.parties[role]!.id, signed: x.state.signed[role] ? shortDay(x.state.signed[role]!) : null,
      // Sample data: you act for the label, and for the artist when it's you.
      canSign: x.state.status === 'sent' && !x.state.signed[role] && (role === 'label' || (role === 'artist' && x.artistIsMe)),
      canSignIn: role === 'label' || (role === 'artist' && x.artistIsMe),
    })),
  };
}

/** A session split once in effect, in the shape the split editor reads. */
export async function mockSplitDeal(node: string): Promise<SplitNodeResponse | null> {
  const x = (await read()).splits.find((y) => y.node === node);
  if (!x || x.state.status !== 'in_effect') return null;
  const name = (r: SplitRole) => x.parties[r]?.name ?? '';
  return {
    breadcrumb: [x.artist, x.title, 'Recording income'], parties: { producer: name('producer'), label: name('label'), artist: name('artist'), feature: name('feature') },
    v4: { version: 1, terms: x.state.terms, effective: longDay(x.created), signed: Object.fromEntries(ORDER.filter((r) => x.state.signed[r]).map((r) => [name(r), shortDay(x.state.signed[r]!)])) },
    v5: null, dealTerms: [['Type', 'Net profit'], ['Set up', 'In the app']],
    market: { text: 'Producer points are usually 2 to 4 on an indie single.', verified: 'Oct 28, 2026' }, history: [],
  };
}

/** Edit, send or sign a session split's open version. */
export async function mockMusicSplitWrite(node: string, apply: (v: VersionState) => SplitOutcome): Promise<SplitOutcome | null> {
  const x = (await read()).splits.find((y) => y.node === node);
  if (!x) return null;
  const out = apply(x.state);
  if (out.ok) await write((st) => { const y = st.splits.find((z) => z.node === node)!; y.state = { ...out.state, roles: x.state.roles }; });
  return out;
}
