import 'server-only';
import { cookies } from 'next/headers';
import type { Recording, SplitNodeResponse, SplitTreeNode, SplitVersionsResponse } from '@breakrecords/contract';
import { isIsrc, normalizeIsrc } from '@breakrecords/core/codes';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { checkLines, editDraft, lineAmounts, lineKey, send, sign, validTerms, type SplitOutcome, type SplitRole, type VersionState } from '@breakrecords/core/splitVersions';
import { recordings as sampleRecordings } from '@/data/ops';
import { TODAY } from '@/data/fixtures';
import { mockSession } from './session';

// Sample-data mode: releases, people and splits added this browser session.
type Release = { id: string; title: string; kind: 'single' | 'ep' | 'album'; artistId: string; artist: string; date: string | null; tracks: { id: string; title: string; isrc: string | null }[] };
type MLine = { role: SplitRole; id: string; name: string; shareBp: number };
type MVersion = { version: number; lines: MLine[]; state: VersionState; created: string };
type Split = { node: string; releaseId: string; title: string; artist: string; artistIsMe: boolean; current: MVersion | null; open: MVersion | null };
type Writer = { id: string; name: string; shareBp: number; confirmed: boolean };
type State = { releases: Release[]; people: { id: string; name: string }[]; splits: Split[]; writers: Record<string, Writer[]>; removed: string[] };
const g = globalThis as unknown as { __brMusic?: Map<string, State> };
const store = (g.__brMusic ??= new Map());
const empty = (): State => ({ releases: [], people: [], splits: [], writers: {}, removed: [] });

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
  const releases = s.releases.map((r) => ({ id: r.id, title: r.title, artist: r.artist, kind: KIND[r.kind], date: dateLabel(r.date), upc: 'Not assigned', tracks: r.tracks.length,
    edit: { kind: r.kind, releaseDate: r.date, tracks: r.tracks.map((t) => ({ id: t.id, title: t.title, isrc: t.isrc })) } }));
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
type LineInput = { role: 'artist' | 'producer' | 'feature'; party: PartyInput; shareBp: number };

/** A person by id, or a new one by name, added to the session's people. */
function personOf(st: State, p: PartyInput): { id: string; name: string } | undefined {
  const all = [...SAMPLE_PEOPLE, ...st.people];
  if ('partyId' in p) return all.find((x) => x.id === p.partyId);
  const person = { id: unique(slugify(p.name), new Set(all.map((x) => x.id))), name: p.name };
  st.people.push(person);
  return person;
}
const keyOf = (lines: MLine[], l: MLine) => lineKey(l.role, l.id, lines.filter((x) => x.role === l.role).length === 1);
const stateFor = (lines: MLine[], terms: DealTerms, status: VersionState['status'], signed: VersionState['signed'] = {}): VersionState =>
  ({ status, terms, signed, roles: lines.map((l) => keyOf(lines, l)) });

/** The draft's people: the label, then the given lines (the release's artist at 100% when none is an artist). */
function linesFrom(st: State, rel: Release, input: LineInput[]): MLine[] | string {
  const lines: MLine[] = [{ role: 'label', id: 'northline-records', name: LABEL, shareBp: 10000 }];
  for (const l of input) {
    const who = personOf(st, l.party);
    if (!who) return 'Someone on this split isn’t in the workspace.';
    lines.push({ role: l.role, id: who.id, name: who.name, shareBp: l.shareBp });
  }
  if (!lines.some((l) => l.role === 'artist')) lines.push({ role: 'artist', id: rel.artistId, name: rel.artist, shareBp: 10000 });
  return checkLines(lines.map((l) => ({ role: l.role, party: l.id, shareBp: l.shareBp }))) ?? lines;
}

export async function mockCreateSplit(c: { releaseId: string; lines?: LineInput[]; artistIsMe?: boolean; terms: DealTerms }): Promise<MusicOutcome<string>> {
  const s = await read();
  const rel = s.releases.find((r) => r.id === c.releaseId);
  if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' };
  if (s.splits.some((x) => x.releaseId === rel.id)) return { ok: false, status: 409, error: 'already_split', message: `${rel.title} already has a split. Open it from Splits.` };
  const bad = validTerms(c.terms);
  if (bad) return { ok: false, status: 400, error: 'invalid_terms', message: bad };
  let out: MusicOutcome<string> = { ok: false, status: 400, error: 'invalid_terms', message: 'Check the split.' };
  await write((st) => {
    const lines = linesFrom(st, rel, c.lines ?? []);
    if (typeof lines === 'string') { out = { ok: false, status: 400, error: 'invalid_terms', message: lines }; return; }
    const node = unique(`${slugify(rel.title)}-recording`, new Set(st.splits.map((x) => x.node)));
    st.splits.push({ node, releaseId: rel.id, title: rel.title, artist: rel.artist, artistIsMe: !!c.artistIsMe, current: null,
      open: { version: 1, lines, state: stateFor(lines, c.terms, 'draft'), created: TODAY.iso } });
    out = { ok: true, value: node };
  });
  return out;
}

/** This session's split nodes, added to the sample tree under the label. */
export async function mockTreeWithSplits(tree: SplitTreeNode[]): Promise<SplitTreeNode[]> {
  const s = await read();
  if (!s.splits.length) return tree;
  const [root, ...rest] = tree;
  const artists = [...(root.children ?? [])];
  for (const x of s.splits) {
    const rel = s.releases.find((r) => r.id === x.releaseId);
    const leaf = { id: x.node, label: 'Recording income', override: true };
    const relNode = { id: `${x.node}-release`, label: `${x.title} (${rel?.kind === 'ep' ? 'EP' : rel?.kind ?? 'single'})`, children: [leaf] };
    const i = artists.findIndex((a) => a.label === x.artist);
    if (i >= 0) artists[i] = { ...artists[i], children: [...(artists[i].children ?? []), relNode] };
    else artists.push({ id: `${slugify(x.artist)}-artist`, label: x.artist, children: [relNode] });
  }
  return [{ ...root, children: artists }, ...rest];
}

const ORDER: SplitRole[] = ['artist', 'label', 'producer', 'feature'];
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function mockSplitVersions(node: string): Promise<SplitVersionsResponse | null> {
  const s = await read();
  const x = s.splits.find((y) => y.node === node);
  if (!x) return null;
  const rel = s.releases.find((r) => r.id === x.releaseId);
  const out = (v: MVersion) => {
    const lines = [...v.lines].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.shareBp - a.shareBp || a.name.localeCompare(b.name));
    const amounts = lineAmounts(v.state.terms, lines.map((l) => ({ role: l.role, party: l.id, shareBp: l.shareBp })));
    return { version: v.version, terms: v.state.terms, effective: longDay(v.created), lines: lines.map((l, i) => {
      const signed = v.state.signed[keyOf(v.lines, l)];
      // Sample data: you act for the label, and for the artist when it's you.
      const mine = l.role === 'label' || (l.role === 'artist' && x.artistIsMe && l.id === rel?.artistId);
      return { role: l.role, name: l.name, partyId: l.id, shareBp: l.shareBp, amount: amounts[i], signed: signed ? shortDay(signed) : null,
        canSign: v.state.status === 'sent' && !signed && mine, canSignIn: mine };
    }) };
  };
  return {
    node, title: x.title, breadcrumb: [x.artist, x.title, 'Recording income'], releaseId: x.releaseId,
    current: x.current ? out(x.current) : null,
    open: x.open ? { ...out(x.open), status: x.open.state.status as 'draft' | 'sent', created: shortDay(x.open.created) } : null,
    canEdit: true,
    songs: (rel?.tracks ?? []).map((t) => ({ recordingId: t.id, title: t.title,
      writers: (s.writers[t.id] ?? []).map((w) => ({ partyId: w.id, name: w.name, shareBp: w.shareBp, confirmed: w.confirmed, canConfirm: false, canSignIn: false })) })),
  };
}

/** A session split, in the shape the original split editor reads. */
export async function mockSplitDeal(node: string): Promise<SplitNodeResponse | null> {
  const x = (await read()).splits.find((y) => y.node === node);
  const v = x?.current;
  if (!x || !v) return null;
  const name = (r: SplitRole) => v.lines.filter((l) => l.role === r).map((l) => l.name).join(' and ');
  return {
    breadcrumb: [x.artist, x.title, 'Recording income'], parties: { producer: name('producer'), label: name('label'), artist: name('artist'), feature: name('feature') },
    v4: { version: v.version, terms: v.state.terms, effective: longDay(v.created), signed: Object.fromEntries(v.lines.filter((l) => v.state.signed[keyOf(v.lines, l)]).map((l) => [l.name, shortDay(v.state.signed[keyOf(v.lines, l)]!)])) },
    v5: null, dealTerms: [['Type', 'Net profit'], ['Set up', 'In the app']],
    market: { text: 'Producer points are usually 2 to 4 on an indie single.', verified: 'Oct 28, 2026' }, history: [],
  };
}

/** Edit, send or sign a session split's open version. A sign names the role, and the person when several share it. */
export async function mockMusicSplitWrite(node: string, w: { kind: 'draft'; terms: DealTerms; lines?: LineInput[] } | { kind: 'send' } | { kind: 'sign'; role: SplitRole; partyId?: string }, today: string): Promise<SplitOutcome | null> {
  const s = await read();
  const x = s.splits.find((y) => y.node === node);
  if (!x) return null;
  if (!x.open) return { ok: false, error: 'not_draft', message: 'There is no open version of this split.' };
  let lines = x.open.lines;
  if (w.kind === 'draft' && w.lines) {
    if (x.open.state.status !== 'draft') return editDraft(x.open.state, w.terms);
    const rel = s.releases.find((r) => r.id === x.releaseId)!;
    let made: MLine[] | string = 'Check the split.';
    await write((st) => { made = linesFrom(st, rel, w.lines!); });
    if (typeof made === 'string') return { ok: false, error: 'invalid_terms', message: made };
    lines = made;
  }
  let key = '';
  if (w.kind === 'sign') {
    const inRole = lines.filter((l) => l.role === w.role);
    const l = w.partyId ? inRole.find((y) => y.id === w.partyId) : inRole.length === 1 ? inRole[0] : undefined;
    if (!l) return { ok: false, error: 'not_a_party', message: 'That person isn’t on this split in that role.' };
    key = keyOf(lines, l);
  }
  const base = stateFor(lines, x.open.state.terms, x.open.state.status, x.open.state.signed);
  const out = w.kind === 'draft' ? editDraft(base, w.terms) : w.kind === 'send' ? send(base) : sign(base, key, today);
  if (!out.ok) return out;
  await write((st) => {
    const y = st.splits.find((z) => z.node === node)!;
    const v = { ...y.open!, lines, state: { ...out.state, roles: base.roles } };
    if (out.state.status === 'in_effect') { y.current = v; y.open = null; } else y.open = v;
  });
  return out;
}

/** A new draft version, copied from the one in effect. */
export async function mockProposeVersion(node: string): Promise<MusicOutcome> {
  const x = (await read()).splits.find((y) => y.node === node);
  if (!x) return { ok: false, status: 404, error: 'not_found', message: 'This split has no version in effect to change.' };
  if (x.open) return { ok: false, status: 409, error: 'not_draft', message: 'A new version is already open. Finish or change that one.' };
  if (!x.current) return { ok: false, status: 404, error: 'not_found', message: 'This split has no version in effect to change.' };
  await write((st) => {
    const y = st.splits.find((z) => z.node === node)!;
    const c = y.current!;
    y.open = { version: c.version + 1, lines: c.lines, state: stateFor(c.lines, c.state.terms, 'draft'), created: TODAY.iso };
  });
  return { ok: true, value: null };
}

/** Sets a session recording's writers (total 100%); confirmations start over. */
export async function mockSetWriters(recordingId: string, writers: { party: PartyInput; shareBp: number }[]): Promise<MusicOutcome> {
  const s = await read();
  if (!s.releases.some((r) => r.tracks.some((t) => t.id === recordingId))) return { ok: false, status: 404, error: 'not_found', message: 'No such recording.' };
  let out: MusicOutcome = { ok: true, value: null };
  await write((st) => {
    const list: Writer[] = [];
    for (const w of writers) {
      const who = personOf(st, w.party);
      if (!who) { out = { ok: false, status: 404, error: 'not_found', message: 'A writer isn’t in the workspace.' }; return; }
      if (list.some((x) => x.id === who.id)) { out = { ok: false, status: 400, error: 'invalid', message: 'Someone is listed twice.' }; return; }
      list.push({ id: who.id, name: who.name, shareBp: w.shareBp, confirmed: false });
    }
    st.writers[recordingId] = list;
  });
  return out;
}

/** Changes a session release: title, kind, date and tracks (kept by id, renamed, added or removed). */
export async function mockEditRelease(id: string, c: { title?: string; kind?: 'single' | 'ep' | 'album'; releaseDate?: string | null; tracks?: { id?: string; title: string; isrc?: string }[] }): Promise<MusicOutcome> {
  const s = await read();
  const rel = s.releases.find((r) => r.id === id);
  if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'Only releases you added can be changed here.' };
  if (c.tracks) {
    const isrcs = c.tracks.map((t) => (t.isrc ? normalizeIsrc(t.isrc) : null));
    const bad = isrcs.find((i) => i && !isIsrc(i));
    if (bad) return { ok: false, status: 400, error: 'invalid', message: `${bad} isn’t a valid ISRC (like US-ABC-26-00001).` };
  }
  await write((st) => {
    const r = st.releases.find((x) => x.id === id)!;
    if (c.title) r.title = c.title;
    if (c.kind) r.kind = c.kind;
    if (c.releaseDate !== undefined) r.date = c.releaseDate;
    if (c.tracks) {
      const taken = new Set(st.releases.flatMap((x) => x.tracks.map((t) => t.id)));
      r.tracks = c.tracks.map((t) => {
        const isrc = t.isrc ? normalizeIsrc(t.isrc) : null;
        if (t.id && r.tracks.some((x) => x.id === t.id)) return { id: t.id, title: t.title, isrc };
        const nid = unique(slugify(t.title), taken); taken.add(nid);
        return { id: nid, title: t.title, isrc };
      });
    }
    for (const sp of st.splits.filter((x) => x.releaseId === id)) sp.title = r.title;
  });
  return { ok: true, value: null };
}

/** Removes a session release, unless its split was sent or signed. */
export async function mockRemoveRelease(id: string): Promise<MusicOutcome> {
  const s = await read();
  const rel = s.releases.find((r) => r.id === id);
  if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'Only releases you added can be removed here.' };
  const sp = s.splits.find((x) => x.releaseId === id);
  if (sp && (sp.current || sp.open?.state.status !== 'draft')) return { ok: false, status: 409, error: 'in_use', message: `${rel.title}’s split has been sent for signatures, so the release stays. Its history matters for payments.` };
  await write((st) => {
    st.releases = st.releases.filter((x) => x.id !== id);
    st.splits = st.splits.filter((x) => x.releaseId !== id);
    for (const t of rel.tracks) delete st.writers[t.id];
  });
  return { ok: true, value: null };
}
