// Prepared documents: what each one says, built only from the catalog's own facts. A fact that
// is missing is never guessed: it becomes a gap, listed on the document and saved with it.
// What each organization asks for, and where that was read, is in docs/RIGHTS_REQUIREMENTS.md.
// Rendering (PDF, CSV) and storage live in the app; this file is pure.

import { FULL, formatPercent, type Bp } from './percent';
import { formatDuration } from './metadata';

export type Pro = 'ascap' | 'bmi' | 'sesac' | 'gmr' | 'socan' | 'prs' | 'other' | 'none';
export type WriterRole = 'composer' | 'lyricist' | 'composer_lyricist';
export type DocKind = 'split_sheet' | 'registration_packet' | 'copyright_worksheet' | 'label_copy'
  | 'pro_registration' | 'mlc_registration' | 'sx_registration' | 'sx_lod' | 'copyright_group';
export type DocSubject = 'work' | 'recording' | 'release';

export type Person = {
  id: string; name: string; type: 'person' | 'group' | 'company';
  legalName: string | null; pro: Pro | null; ipi: string | null; email: string | null;
  address: string | null; citizenship: string | null; domicile: string | null;
};

export type SongFacts = {
  id: string; title: string; iswc: string | null; altTitles: string[]; completionYear: number | null; hasLyrics: boolean;
  writers: { person: Person; shareBp: Bp; confirmed: boolean; role: WriterRole | null; publisher: Person | null }[];
  recordings: { title: string; isrc: string | null; artist: string; durationS: number | null }[];
};

export type ReleaseRef = { title: string; kind: 'single' | 'ep' | 'album'; upc: string | null; releaseDate: string | null };

export type RecordingFacts = {
  id: string; title: string; isrc: string | null; durationS: number | null; genre: string | null;
  artist: Person; owner: Person | null; pYear: number | null;
  credits: { name: string; role: string; person?: Person | null }[];
  song: SongFacts | null;
  releases: ReleaseRef[];
};

export type ReleaseFacts = ReleaseRef & { id: string; artist: Person; labelName: string; tracks: { position: number; recording: RecordingFacts }[] };

export type Gap = { severity: 'blocker' | 'warning'; field: string; message: string };
export type Row = [label: string, value: string | null];
export type Section = {
  heading: string;
  intro?: string;
  rows?: Row[];
  table?: { columns: string[]; rows: (string | null)[][] };
  steps?: string[];
  signatures?: string[];
};
export type PreparedDoc = {
  kind: DocKind; subject: DocSubject; subjectId: string;
  title: string; subtitle: string; sections: Section[]; gaps: Gap[];
  csv: { name: string; rows: string[][] } | null;
};

export const DOC_LABEL: Record<DocKind, string> = {
  split_sheet: 'Split sheet', registration_packet: 'Registration packet', copyright_worksheet: 'Copyright worksheet', label_copy: 'Label copy',
  pro_registration: 'PRO registration', mlc_registration: 'MLC registration', sx_registration: 'SoundExchange registration',
  sx_lod: 'SoundExchange Letter of Direction', copyright_group: 'Copyright: album group',
};
export const PRO_LABEL: Record<Pro, string> = { ascap: 'ASCAP', bmi: 'BMI', sesac: 'SESAC', gmr: 'GMR', socan: 'SOCAN', prs: 'PRS', other: 'Other', none: 'Not a member' };
export const ROLE_LABEL: Record<WriterRole, string> = { composer: 'Music', lyricist: 'Lyrics', composer_lyricist: 'Music and lyrics' };

/** Which documents a subject can have. */
export const DOCS_FOR: Record<DocSubject, DocKind[]> = {
  work: ['split_sheet', 'pro_registration', 'mlc_registration', 'copyright_worksheet'],
  recording: ['sx_registration', 'sx_lod', 'copyright_worksheet'],
  release: ['label_copy', 'copyright_group'],
};

/** What a Letter of Direction says: who is paid, what percentage of the featured artist's share, from when. */
export type LodTerms = { payee: string; percentBp: Bp | null; effectiveDate: string | null; allRoyalties: boolean };
export type PrepareOptions = { lod?: LodTerms };

const legal = (p: Person) => p.legalName ?? p.name;
const total = (s: SongFacts) => s.writers.reduce((a, w) => a + w.shareBp, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Gaps every song document shares: names, PROs, IPIs, roles, shares that total exactly 100%. */
function songGaps(s: SongFacts, opts: { pro: boolean }): Gap[] {
  const gaps: Gap[] = [];
  if (!s.writers.length) gaps.push({ severity: 'blocker', field: 'Writers', message: `${s.title} has no writers on file.` });
  const sum = total(s);
  if (s.writers.length && sum !== FULL) {
    gaps.push({ severity: 'blocker', field: 'Shares', message: `Writer shares add up to ${formatPercent(sum)}, not 100%.` });
  }
  for (const w of s.writers) {
    const who = w.person.name;
    if (!w.person.legalName) gaps.push({ severity: 'warning', field: 'Legal name', message: `${who}'s legal name isn't on file; the stage name is used.` });
    if (!w.role) gaps.push({ severity: 'warning', field: 'Role', message: `Whether ${who} wrote music, lyrics or both isn't on file.` });
    if (opts.pro) {
      if (!w.person.pro) gaps.push({ severity: 'blocker', field: 'PRO', message: `${who}'s PRO isn't on file. Each writer registers through their own PRO.` });
      else if (w.person.pro === 'none') gaps.push({ severity: 'warning', field: 'PRO', message: `${who} isn't in a PRO, so their performance royalties have no one to collect them.` });
      if (!w.person.ipi && w.person.pro !== 'none') gaps.push({ severity: 'blocker', field: 'IPI', message: `${who}'s IPI number isn't on file. Their PRO lists it in their account.` });
    }
  }
  return gaps;
}

// ---------- Split sheet ----------

export function splitSheet(s: SongFacts, preparedOn: string): PreparedDoc {
  const gaps = songGaps(s, { pro: true });
  const unsigned = s.writers.filter((w) => !w.confirmed);
  if (unsigned.length) gaps.push({ severity: 'warning', field: 'Signatures', message: `${plural(unsigned.length, 'writer hasn’t', 'writers haven’t')} signed yet: ${unsigned.map((w) => w.person.name).join(', ')}.` });
  return {
    kind: 'split_sheet', subject: 'work', subjectId: s.id,
    title: `Split sheet: ${s.title}`, subtitle: `Prepared ${preparedOn}`,
    sections: [
      { heading: 'Song', rows: [['Title', s.title], ['Also known as', s.altTitles.join(', ') || 'None'], ['ISWC', s.iswc ?? 'Not assigned yet'], ['Year finished', s.completionYear ? String(s.completionYear) : null]] },
      {
        heading: 'Writers and shares',
        intro: 'Each writer’s share of the song. The shares must total exactly 100%.',
        table: {
          columns: ['Legal name', 'Wrote', 'PRO', 'IPI', 'Publisher', 'Share'],
          rows: [
            ...s.writers.map((w) => [legal(w.person), w.role ? ROLE_LABEL[w.role] : null, w.person.pro ? PRO_LABEL[w.person.pro] : null, w.person.ipi, w.publisher ? legal(w.publisher) : 'None', formatPercent(w.shareBp, { fixed: true })]),
            ['Total', '', '', '', '', formatPercent(total(s), { fixed: true })],
          ],
        },
      },
      {
        heading: 'Agreement',
        intro: 'By signing, each writer agrees that the shares above are correct for this song and its versions under the same title.',
        signatures: s.writers.map((w) => legal(w.person)),
      },
    ],
    gaps,
    csv: null,
  };
}

// ---------- Registration packets ----------

/**
 * Performance royalties are split evenly between writers and publishers: on ASCAP's form the
 * writer shares add to 50% and the publisher shares to 50%. Halving an odd share leaves one
 * basis point over; it goes to the writer.
 */
export function proShares(s: SongFacts) {
  return s.writers.map((w) => {
    const pub = Math.floor(w.shareBp / 2);
    return { writer: w, writerBp: w.shareBp - pub, publisherBp: pub };
  });
}

/**
 * Mechanical ownership at the MLC is 100% of the song: each writer's share is claimed by their
 * publisher, or by the writer themselves when they self-administer (no publisher).
 */
export function mlcShares(s: SongFacts) {
  const owners = new Map<string, { owner: Person; selfAdministered: boolean; shareBp: Bp }>();
  for (const w of s.writers) {
    const owner = w.publisher ?? w.person;
    const cur = owners.get(owner.id) ?? { owner, selfAdministered: !w.publisher, shareBp: 0 };
    cur.shareBp += w.shareBp;
    owners.set(owner.id, cur);
  }
  return [...owners.values()];
}

export function songPacket(s: SongFacts, preparedOn: string): PreparedDoc {
  const gaps = songGaps(s, { pro: true });
  for (const w of s.writers) {
    if (!w.publisher) gaps.push({ severity: 'warning', field: 'Publisher', message: `${w.person.name} has no publisher, so the publisher half of their performance royalties can go unpaid unless they register as their own publisher.` });
    else if (!w.publisher.ipi) gaps.push({ severity: 'blocker', field: 'Publisher IPI', message: `${w.publisher.name}'s IPI number isn't on file.` });
  }
  if (!s.recordings.some((r) => r.isrc)) gaps.push({ severity: 'warning', field: 'ISRC', message: 'No recording of this song has an ISRC yet, so the MLC can’t match streams to it.' });
  const pros = [...new Set(s.writers.map((w) => w.person.pro).filter((p): p is Pro => !!p && p !== 'none' && p !== 'other'))];
  const shares = proShares(s);
  const recRows = s.recordings.map((r) => [r.title, r.artist, r.isrc, formatDuration(r.durationS) || null]);
  const sections: Section[] = [
    { heading: 'Song', rows: [['Title', s.title], ['Alternate titles', s.altTitles.join(', ') || 'None'], ['ISWC', s.iswc ?? 'Not assigned yet (the first registration gets one)'], ['Year finished', s.completionYear ? String(s.completionYear) : null]] },
    {
      heading: 'Performing rights (PRO)',
      intro: 'Each writer registers with their own PRO, listing every writer and publisher. Writer shares add up to 50% and publisher shares to 50%.',
      table: {
        columns: ['Party', 'Type', 'PRO', 'IPI', 'Share'],
        rows: shares.flatMap(({ writer: w, writerBp, publisherBp }) => [
          [legal(w.person), 'Writer', w.person.pro ? PRO_LABEL[w.person.pro] : null, w.person.ipi, formatPercent(writerBp, { fixed: true })],
          w.publisher ? [legal(w.publisher), `Publisher for ${w.person.name}`, w.publisher.pro ? PRO_LABEL[w.publisher.pro] : null, w.publisher.ipi, formatPercent(publisherBp, { fixed: true })]
            : ['No publisher', `Publisher share for ${w.person.name}`, null, null, formatPercent(publisherBp, { fixed: true })],
        ]),
      },
      steps: [
        ...pros.map((p) => `${PRO_LABEL[p]}: sign in to your ${PRO_LABEL[p]} account and register a work with the details above.${p === 'ascap' ? ' ASCAP also takes registrations in its mobile app.' : ''}`),
        'Add the performers and ISRCs below so performances are matched.',
        'Write down the work ID each PRO gives you, then record it here as submitted.',
      ],
    },
    {
      heading: 'Mechanical rights (The MLC)',
      intro: 'At The MLC the owners’ shares add up to 100%. A publisher or administrator registers for its writers; a writer with no publisher registers as a self-administered member.',
      table: {
        columns: ['Owner', 'Registers as', 'IPI', 'Share'],
        rows: mlcShares(s).map((o) => [legal(o.owner), o.selfAdministered ? 'Self-administered writer' : 'Publisher', o.owner.ipi, formatPercent(o.shareBp, { fixed: true })]),
      },
      steps: [
        'Sign in to The MLC Portal (portal.themlc.com).',
        'Search the Claiming Tool first: if the song is already there, claim your share instead of registering it again.',
        'If it isn’t there, add it with the Works Registration Tools, using the shares above.',
        'Use the Matching Tool to connect the recordings below by ISRC.',
      ],
    },
    { heading: 'Recordings of this song', table: { columns: ['Title', 'Artist', 'ISRC', 'Length'], rows: recRows.length ? recRows : [['None yet', '', '', '']] } },
  ];
  const csv = [['Song title', 'ISWC', 'Party', 'Type', 'PRO', 'IPI', 'Performance share', 'MLC share', 'ISRCs']];
  const isrcs = s.recordings.map((r) => r.isrc).filter(Boolean).join(' ');
  for (const { writer: w, writerBp, publisherBp } of shares) {
    csv.push([s.title, s.iswc ?? '', legal(w.person), 'Writer', w.person.pro ? PRO_LABEL[w.person.pro] : '', w.person.ipi ?? '', formatPercent(writerBp, { fixed: true }), w.publisher ? '' : formatPercent(w.shareBp, { fixed: true }), isrcs]);
    if (w.publisher) csv.push([s.title, s.iswc ?? '', legal(w.publisher), 'Publisher', w.publisher.pro ? PRO_LABEL[w.publisher.pro] : '', w.publisher.ipi ?? '', formatPercent(publisherBp, { fixed: true }), formatPercent(w.shareBp, { fixed: true }), isrcs]);
  }
  return { kind: 'registration_packet', subject: 'work', subjectId: s.id, title: `Registration packet: ${s.title}`, subtitle: `PRO and The MLC · Prepared ${preparedOn}`, sections, gaps, csv: { name: 'song-registration.csv', rows: csv } };
}

export function recordingPacket(r: RecordingFacts, preparedOn: string): PreparedDoc {
  const gaps: Gap[] = [];
  if (!r.isrc) gaps.push({ severity: 'blocker', field: 'ISRC', message: `${r.title} has no ISRC. Recordings are claimed by ISRC; get codes from your distributor or a US ISRC prefix (usisrc.org, one-time $95).` });
  if (!r.owner) gaps.push({ severity: 'blocker', field: 'Owner', message: 'Who owns this master isn’t on file. SoundExchange pays the owner’s share to them.' });
  if (!r.durationS) gaps.push({ severity: 'warning', field: 'Length', message: 'The recording’s length isn’t on file.' });
  if (!r.releases.length) gaps.push({ severity: 'warning', field: 'Release', message: 'This recording isn’t on a release yet.' });
  const rel = r.releases[0] ?? null;
  const producers = r.credits.filter((c) => /produc/i.test(c.role));
  return {
    kind: 'registration_packet', subject: 'recording', subjectId: r.id,
    title: `Registration packet: ${r.title}`, subtitle: `SoundExchange · Prepared ${preparedOn}`,
    sections: [
      {
        heading: 'Recording',
        rows: [['Title', r.title], ['Featured artist', r.artist.name], ['ISRC', r.isrc], ['Master owner', r.owner ? legal(r.owner) : null],
          ['℗ year', r.pYear ? String(r.pYear) : null], ['Length', formatDuration(r.durationS) || null], ['Genre', r.genre],
          ['Release', rel ? `${rel.title} (${rel.kind})` : null], ['UPC', rel?.upc ?? null], ['Release date', rel?.releaseDate ?? null]],
      },
      {
        heading: 'SoundExchange',
        intro: 'Digital radio (SiriusXM, Pandora, internet radio) pays the featured artist and the master owner separately. Each registers once, then claims recordings by ISRC.',
        steps: [
          `Featured artist (${r.artist.name}): register at soundexchange.com as an artist, then claim this recording by ISRC in SoundExchange Direct.`,
          `Master owner (${r.owner ? legal(r.owner) : 'not on file'}): register as a sound recording owner and add this ISRC to the catalog.`,
          ...(producers.length ? [`Producers (${producers.map((p) => p.name).join(', ')}) are paid from the artist’s share only if the artist signs a Letter of Direction.`] : []),
          'Record each registration here as submitted, with SoundExchange’s reference.',
        ],
      },
    ],
    gaps,
    csv: { name: 'recording-registration.csv', rows: [
      ['ISRC', 'Title', 'Featured artist', 'Master owner', 'P year', 'Length', 'Genre', 'Release', 'UPC', 'Release date'],
      [r.isrc ?? '', r.title, r.artist.name, r.owner ? legal(r.owner) : '', r.pYear ? String(r.pYear) : '', formatDuration(r.durationS), r.genre ?? '', rel?.title ?? '', rel?.upc ?? '', rel?.releaseDate ?? ''],
    ] },
  };
}

// ---------- Copyright worksheets ----------

/** Copyright Office fees read on copyright.gov (docs/RIGHTS_REQUIREMENTS.md). */
export const COPYRIGHT_FEES = { standard: 6500, single: 4500, albumGroup: 6500 } as const;

const authorRows = (p: Person, created: string): (string | null)[] => [legal(p), p.citizenship, p.domicile, created];

export function songCopyright(s: SongFacts, preparedOn: string): PreparedDoc {
  const gaps = songGaps(s, { pro: false });
  for (const w of s.writers) {
    if (!w.person.citizenship && !w.person.domicile) gaps.push({ severity: 'blocker', field: 'Citizenship', message: `${w.person.name}'s citizenship or home country isn't on file. The application asks for one of them.` });
    if (!w.person.address) gaps.push({ severity: 'warning', field: 'Address', message: `${w.person.name}'s address isn't on file. Each claimant's address goes on the application.` });
  }
  // Single Application: one author, who is also the claimant, one work, not made for hire.
  const single = s.writers.length === 1 && !s.writers[0].publisher;
  return {
    kind: 'copyright_worksheet', subject: 'work', subjectId: s.id,
    title: `Copyright worksheet: ${s.title}`, subtitle: `Musical work · Prepared ${preparedOn}`,
    sections: [
      { heading: 'The work', rows: [['Type of work', 'Work of the performing arts (musical work)'], ['Title', s.title], ['Other titles', s.altTitles.join(', ') || 'None'], ['Year finished', s.completionYear ? String(s.completionYear) : null], ['Lyrics included', s.hasLyrics ? 'Yes' : 'No']] },
      {
        heading: 'Authors',
        intro: 'Everyone who wrote the song. Work made for hire: No, unless a written agreement says otherwise.',
        table: { columns: ['Legal name', 'Citizenship', 'Home country', 'Created'], rows: s.writers.map((w) => authorRows(w.person, w.role === 'lyricist' ? 'Lyrics' : w.role === 'composer' ? 'Music' : w.role ? 'Music and lyrics' : 'Not on file')) },
      },
      { heading: 'Claimants', intro: 'The owners of the copyright: usually the writers, or a publisher they transferred it to in writing.', table: { columns: ['Name', 'Address'], rows: s.writers.map((w) => [legal(w.publisher ?? w.person), (w.publisher ?? w.person).address]) } },
      {
        heading: 'Filing',
        rows: [['Application', single ? 'Single Application ($45): one writer, who is also the claimant, and not made for hire' : s.writers.length === 1 ? 'Standard Application ($65): the claimant is a publisher, not the writer' : 'Standard Application ($65): more than one writer'], ['Where', 'copyright.gov, Registration Portal']],
        steps: ['Sign in to the Copyright Office registration portal and start a new application for a work of the performing arts.', 'Copy the details above; upload the lyrics and a recording or score as the deposit.', 'Record the case number here as submitted.'],
      },
    ],
    gaps,
    csv: null,
  };
}

export function recordingCopyright(r: RecordingFacts, preparedOn: string): PreparedDoc {
  const gaps: Gap[] = [];
  const owner = r.owner;
  if (!owner) gaps.push({ severity: 'blocker', field: 'Claimant', message: 'Who owns this master isn’t on file. The owner is the claimant.' });
  else {
    if (!owner.address) gaps.push({ severity: 'blocker', field: 'Claimant address', message: `${owner.name}'s address isn't on file.` });
    if (owner.id !== r.artist.id) gaps.push({ severity: 'warning', field: 'Transfer', message: `The claimant (${owner.name}) isn't the performing artist. The application asks how ownership passed: work made for hire, or a written transfer. Check the recording agreement.` });
  }
  if (!r.artist.citizenship && !r.artist.domicile) gaps.push({ severity: 'blocker', field: 'Citizenship', message: `${r.artist.name}'s citizenship or home country isn't on file.` });
  const rel = r.releases.find((x) => x.releaseDate) ?? null;
  return {
    kind: 'copyright_worksheet', subject: 'recording', subjectId: r.id,
    title: `Copyright worksheet: ${r.title}`, subtitle: `Sound recording · Prepared ${preparedOn}`,
    sections: [
      { heading: 'The work', rows: [['Type of work', 'Sound recording'], ['Title', r.title], ['Year finished', r.pYear ? String(r.pYear) : null], ['Published', rel ? `Yes, ${rel.releaseDate}, United States` : 'Not yet']] },
      { heading: 'Author', intro: 'The performers and producer whose work is in the recording, or the owner if it was made for hire.', table: { columns: ['Legal name', 'Citizenship', 'Home country', 'Created'], rows: [authorRows(r.artist, 'Sound recording, performance')] } },
      { heading: 'Claimant', rows: [['Name', owner ? legal(owner) : null], ['Address', owner?.address ?? null], ['Transfer statement', owner && owner.id !== r.artist.id ? 'By written agreement (confirm)' : 'None needed']] },
      {
        heading: 'Filing',
        rows: [['Application', owner && owner.id === r.artist.id ? 'Single Application ($45) if the artist is the only author and it wasn’t made for hire; otherwise Standard Application ($65)' : 'Standard Application ($65): the claimant isn’t the performing artist'],
          ['Also possible', 'The whole album as one group of works ($65): see the release’s album group worksheet'], ['Where', 'copyright.gov, Registration Portal']],
        steps: ['Start a new sound recording application in the Copyright Office registration portal.', 'Copy the details above and upload the audio as the deposit.', 'Record the case number here as submitted.'],
      },
    ],
    gaps,
    csv: null,
  };
}

// ---------- Label copy ----------

export function labelCopy(r: ReleaseFacts, preparedOn: string): PreparedDoc {
  const gaps: Gap[] = [];
  if (!r.upc) gaps.push({ severity: 'blocker', field: 'UPC', message: `${r.title} has no UPC. Your distributor assigns one.` });
  if (!r.releaseDate) gaps.push({ severity: 'blocker', field: 'Release date', message: 'The release date isn’t set.' });
  if (!r.tracks.length) gaps.push({ severity: 'blocker', field: 'Tracks', message: 'The release has no tracks.' });
  for (const t of r.tracks) {
    const rec = t.recording;
    if (!rec.isrc) gaps.push({ severity: 'blocker', field: 'ISRC', message: `Track ${t.position}, ${rec.title}, has no ISRC.` });
    if (!rec.genre) gaps.push({ severity: 'warning', field: 'Genre', message: `Track ${t.position}, ${rec.title}, has no genre.` });
    if (!rec.song) gaps.push({ severity: 'warning', field: 'Writers', message: `Track ${t.position}, ${rec.title}, isn't linked to a song, so it has no writers.` });
    else if (total(rec.song) !== FULL) gaps.push({ severity: 'blocker', field: 'Shares', message: `${rec.song.title}'s writer shares don't total 100%.` });
  }
  const year = r.releaseDate?.slice(0, 4) ?? null;
  const owner = r.tracks[0]?.recording.owner;
  const writers = (rec: RecordingFacts) => rec.song ? rec.song.writers.map((w) => `${legal(w.person)} ${formatPercent(w.shareBp)}`).join('; ') : '';
  const pubs = (rec: RecordingFacts) => rec.song ? [...new Set(rec.song.writers.map((w) => (w.publisher ? legal(w.publisher) : 'None')))].join('; ') : '';
  return {
    kind: 'label_copy', subject: 'release', subjectId: r.id,
    title: `Label copy: ${r.title}`, subtitle: `${r.artist.name} · Prepared ${preparedOn}`,
    sections: [
      { heading: 'Release', rows: [['Title', r.title], ['Artist', r.artist.name], ['Type', r.kind === 'ep' ? 'EP' : r.kind[0].toUpperCase() + r.kind.slice(1)], ['UPC', r.upc], ['Release date', r.releaseDate], ['Label', r.labelName],
        ['℗ line', year && owner ? `℗ ${year} ${legal(owner)}` : null], ['© line', year ? `© ${year} ${r.labelName}` : null]] },
      { heading: 'Tracks', table: { columns: ['#', 'Title', 'ISRC', 'Length', 'Writers', 'Publishers'], rows: r.tracks.map((t) => [String(t.position), t.recording.title, t.recording.isrc, formatDuration(t.recording.durationS) || null, writers(t.recording) || null, pubs(t.recording) || null]) } },
      { heading: 'Credits', table: { columns: ['Track', 'Name', 'Role'], rows: r.tracks.flatMap((t) => t.recording.credits.map((c) => [t.recording.title, c.name, c.role])) } },
    ],
    gaps,
    csv: { name: 'label-copy.csv', rows: [
      ['Track', 'Title', 'Artist', 'ISRC', 'Length', 'Genre', 'ISWC', 'Writers', 'Publishers', 'UPC', 'Release date'],
      ...r.tracks.map((t) => [String(t.position), t.recording.title, t.recording.artist.name, t.recording.isrc ?? '', formatDuration(t.recording.durationS), t.recording.genre ?? '', t.recording.song?.iswc ?? '', writers(t.recording), pubs(t.recording), r.upc ?? '', r.releaseDate ?? '']),
    ] },
  };
}

// ---------- One form for each organization ----------
// Each follows the organization's own steps, as read on its site (docs/RIGHTS_REQUIREMENTS.md).

const proOf = (p: Person) => (p.pro ? PRO_LABEL[p.pro] : null);
const songHead = (s: SongFacts): Section => ({ heading: 'Song', rows: [['Work title', s.title], ['Alternate titles', s.altTitles.join(', ') || 'None'], ['ISWC', s.iswc ?? 'Not assigned yet (the first registration gets one)']] });
const recordingsOf = (s: SongFacts): Section => ({
  heading: 'Recordings and performers',
  table: { columns: ['Recording title', 'Artist', 'ISRC', 'Length'], rows: s.recordings.length ? s.recordings.map((r) => [r.title, r.artist, r.isrc, formatDuration(r.durationS) || null]) : [['None yet', '', '', '']] },
});

/**
 * PRO song registration. Every writer registers with their own PRO. ASCAP's form splits the song
 * 50% writers, 50% publishers; BMI counts writers to 100% and publishers to 100% (a 200% basis),
 * and shows "Manuscript" where a writer has no publisher.
 */
export function proRegistration(s: SongFacts, preparedOn: string): PreparedDoc {
  const gaps = songGaps(s, { pro: true });
  for (const w of s.writers) {
    if (w.publisher && !w.publisher.ipi) gaps.push({ severity: 'blocker', field: 'Publisher IPI', message: `${w.publisher.name}'s IPI number isn't on file.` });
    if (!w.publisher) gaps.push({ severity: 'warning', field: 'Publisher', message: `${w.person.name} has no publisher. The publisher share of their performance royalties goes unpaid unless they set up their own publishing company with their PRO.` });
  }
  if (!s.recordings.some((r) => r.isrc)) gaps.push({ severity: 'warning', field: 'ISRC', message: 'No recording of this song has an ISRC yet. Adding one helps the PRO match performances.' });
  const pros = [...new Set(s.writers.map((w) => w.person.pro).filter((p): p is Pro => !!p && p !== 'none'))];
  const half = proShares(s);
  const sections: Section[] = [songHead(s)];
  for (const pro of pros) {
    const members = s.writers.filter((w) => w.person.pro === pro).map((w) => w.person.name);
    const bmi = pro === 'bmi';
    sections.push({
      heading: `${PRO_LABEL[pro]}: register the song`,
      intro: `${members.join(' and ')} ${members.length === 1 ? 'is' : 'are'} with ${PRO_LABEL[pro]}. List every writer and publisher on the song, including those in other PROs.`
        + (bmi ? ' BMI counts writers to 100% and publishers to 100%. A writer with no publisher shows as “Manuscript”.' : ' Writer shares add up to 50% and publisher shares to 50%, 100% in total.')
        + (pro !== 'ascap' && pro !== 'bmi' ? ` These shares follow the 50/50 split most PROs use; check them against ${PRO_LABEL[pro]}’s form.` : ''),
      table: {
        columns: ['Name', 'Role', 'PRO', 'IPI', 'Share'],
        rows: half.flatMap(({ writer: w, writerBp, publisherBp }) => [
          [legal(w.person), 'Writer', proOf(w.person), w.person.ipi, formatPercent(bmi ? w.shareBp : writerBp, { fixed: true })],
          w.publisher ? [legal(w.publisher), `Publisher for ${w.person.name}`, proOf(w.publisher), w.publisher.ipi, formatPercent(bmi ? w.shareBp : publisherBp, { fixed: true })]
            : [bmi ? 'Manuscript (no publisher)' : 'No publisher', `Publisher share for ${w.person.name}`, null, null, formatPercent(bmi ? w.shareBp : publisherBp, { fixed: true })],
        ]),
      },
      steps: pro === 'ascap' ? [
        'Sign in to ASCAP Member Access and choose Register a Work (or use the ASCAP mobile app).',
        'Register the work once: it appears in the catalog of every party you list. If the song isn’t self-published, ASCAP prefers the publisher registers it.',
        'Enter the title, alternate titles, every writer and publisher with the shares above, and the performers once the song is performed.',
        'Write down the work ID ASCAP gives you, then record it in Registrations.',
      ] : bmi ? [
        'Sign in to BMI Online Services, go to Works Registration and choose Add New Work.',
        'Work Info: the title. Other Works: alternate titles. Publishers & Writers: everyone above with their shares. Artists & Recordings: the recordings below. Then check the Summary and submit.',
        'Each co-publisher should register the song too, so it lands in their account. BMI keeps the shares from the first registration it receives.',
        'Write down the work ID BMI gives you, then record it in Registrations.',
      ] : [
        `Sign in to your ${PRO_LABEL[pro]} account and register a new work with the details above.`,
        'Write down the work ID they give you, then record it in Registrations.',
      ],
    });
  }
  if (!pros.length) sections.push({ heading: 'No PRO on file', intro: 'None of the writers has a PRO on file, so there is nowhere to register performance royalties yet.' });
  sections.push(recordingsOf(s));
  const csv = [['PRO', 'Work title', 'ISWC', 'Name', 'Role', 'Party PRO', 'IPI', 'Share']];
  for (const pro of pros) {
    const bmi = pro === 'bmi';
    for (const { writer: w, writerBp, publisherBp } of half) {
      csv.push([PRO_LABEL[pro], s.title, s.iswc ?? '', legal(w.person), 'Writer', proOf(w.person) ?? '', w.person.ipi ?? '', formatPercent(bmi ? w.shareBp : writerBp, { fixed: true })]);
      csv.push([PRO_LABEL[pro], s.title, s.iswc ?? '', w.publisher ? legal(w.publisher) : bmi ? 'Manuscript' : 'No publisher', 'Publisher', w.publisher ? proOf(w.publisher) ?? '' : '', w.publisher?.ipi ?? '', formatPercent(bmi ? w.shareBp : publisherBp, { fixed: true })]);
    }
  }
  return { kind: 'pro_registration', subject: 'work', subjectId: s.id, title: `PRO registration: ${s.title}`, subtitle: `${pros.map((p) => PRO_LABEL[p]).join(', ') || 'No PRO'} · Prepared ${preparedOn}`, sections, gaps, csv: { name: 'pro-registration.csv', rows: csv } };
}

/** The MLC's writer role codes (Bulk Work help page). */
export const MLC_ROLE: Record<WriterRole, string> = { composer: 'C', lyricist: 'A', composer_lyricist: 'CA' };

/**
 * The MLC: the Individual Registration Tool's six steps (search, work details, writers and roles,
 * publishers and collection shares, recordings, review). Bulk upload needs a publisher IPI.
 */
export function mlcRegistration(s: SongFacts, preparedOn: string): PreparedDoc {
  const gaps = songGaps(s, { pro: false });
  for (const w of s.writers) if (!w.person.ipi) gaps.push({ severity: 'warning', field: 'IPI', message: `${w.person.name}'s IPI number isn't on file. The MLC finds writers by name or IPI; the IPI avoids picking the wrong person.` });
  if (s.writers.length && !s.writers.some((w) => w.role === 'composer' || w.role === 'composer_lyricist')) {
    gaps.push({ severity: 'blocker', field: 'Writer role', message: 'At least one writer must be a Composer (C) or Composer/Author (CA). Set who wrote the music.' });
  }
  if (s.altTitles.length) gaps.push({ severity: 'warning', field: 'Alternative titles', message: 'The MLC only wants an alternative title for a language variation, a live variation, or a remix with the same writers. Leave out any others.' });
  if (!s.recordings.some((r) => r.isrc)) gaps.push({ severity: 'warning', field: 'ISRC', message: 'No recording of this song has an ISRC yet, so The MLC can’t match streams to it.' });
  const owners = mlcShares(s);
  const anyPublisherIpi = owners.some((o) => !o.selfAdministered && o.owner.ipi);
  const firstWriter = s.writers[0];
  return {
    kind: 'mlc_registration', subject: 'work', subjectId: s.id, title: `MLC registration: ${s.title}`, subtitle: `The MLC, Individual Registration Tool · Prepared ${preparedOn}`,
    sections: [
      { heading: 'Step 1: Search first', intro: 'In the Member Hub, open Individual Registration Tool and search with at least two criteria. If the song is already there, claim your share instead of registering it again; if its shares already add up to 100%, file an overclaim.',
        rows: [['Work Title', s.title], ['Writer Name', firstWriter ? legal(firstWriter.person) : null]] },
      { heading: 'Step 2: Work details', intro: 'Only the work title is required. Add an alternative title only for a language variation, a live variation, or a remix with the same writers.',
        rows: [['Work Title', s.title], ['Alternative titles', s.altTitles.join(', ') || 'None'], ['ISWC', s.iswc ?? 'None yet']] },
      { heading: 'Step 3: Writers and roles', intro: 'Search each writer by name or IPI and add them; create the writer only if the search doesn’t find them. At least one writer must be a Composer or Composer/Author.',
        table: { columns: ['Writer (legal name)', 'IPI', 'Role code', 'Role'], rows: s.writers.map((w) => [legal(w.person), w.person.ipi, w.role ? MLC_ROLE[w.role] : null, w.role === 'composer' ? 'Composer' : w.role === 'lyricist' ? 'Author (lyrics)' : w.role === 'composer_lyricist' ? 'Composer/Author' : null]) } },
      { heading: 'Step 4: Publishers and collection shares', intro: 'Enter only the shares you control. A self-administered songwriter with no publishing company uses their own Member account as the publisher. Each collection share is between 0.01% and 100%.',
        table: { columns: ['Publisher', 'Registers as', 'IPI', 'Collection share'], rows: owners.map((o) => [legal(o.owner), o.selfAdministered ? 'Self-administered (your Member account)' : 'Publisher', o.owner.ipi, formatPercent(o.shareBp, { fixed: true })]) } },
      { heading: 'Step 5: Recordings (optional)', intro: 'Recordings help The MLC match streams to the song. Recording title and artist are required for each one you add.',
        table: { columns: ['Recording Title', 'Recording Artist Name', 'ISRC'], rows: s.recordings.length ? s.recordings.map((r) => [r.title, r.artist, r.isrc]) : [['None yet', '', '']] } },
      { heading: 'Step 6: Review and submit', steps: ['Check every section, then press Submit.', 'The MLC shows a reference number and a Submitted status. Record that number in Registrations.'] },
      { heading: 'Registering many songs at once', intro: anyPublisherIpi
        ? 'With a publisher IPI you can use the Bulk Registration Tool: download the template from the Member Hub and fill one row per writer. The spreadsheet saved with this form has the values for the columns below; the template’s Field Definitions tab explains the rest. Keep the template’s columns where they are, save it as .xlsx, and stay within 300 rows.'
        : 'Bulk upload needs a publisher IPI. A self-administered songwriter without one registers each song with the Individual Registration Tool, as above.' },
    ],
    gaps,
    csv: { name: 'mlc-bulk-rows.csv', rows: [
      ['Work title (A)', 'AKA title (E)', 'AKA title type code (F)', 'Writer (G to I)', 'Writer role code (J)', 'Publisher IPI (M)', 'Collection share (Q)', 'Recording title (R)', 'Recording artist (S)'],
      ...s.writers.map((w, i) => {
        const owner = w.publisher ?? w.person;
        const rec = s.recordings[i];
        return [i === 0 ? s.title : '', '', '', legal(w.person), w.role ? MLC_ROLE[w.role] : '', w.publisher ? owner.ipi ?? '' : '', formatPercent(w.shareBp, { fixed: true }), rec?.title ?? '', rec?.artist ?? ''];
      }),
    ] },
  };
}

/** SoundExchange: the featured artist and the master owner each register, then the owner submits the recording by ISRC. */
export function sxRegistration(r: RecordingFacts, preparedOn: string): PreparedDoc {
  const gaps: Gap[] = [];
  if (!r.isrc) gaps.push({ severity: 'blocker', field: 'ISRC', message: `${r.title} has no ISRC. SoundExchange identifies every recording by its ISRC.` });
  if (!r.owner) gaps.push({ severity: 'blocker', field: 'Owner', message: 'Who owns this master isn’t on file. SoundExchange pays the owner’s share to them.' });
  if (!r.releases.length) gaps.push({ severity: 'blocker', field: 'Release', message: 'This recording isn’t on a release. A submitted recording needs at least one release.' });
  if (r.owner && !r.owner.citizenship && !r.owner.domicile) gaps.push({ severity: 'warning', field: 'Owner nationality', message: `${r.owner.name}'s country isn't on file. It's optional on the form.` });
  const rel = r.releases[0] ?? null;
  const participants = r.credits.filter((c) => CREATIVE.test(c.role));
  return {
    kind: 'sx_registration', subject: 'recording', subjectId: r.id, title: `SoundExchange registration: ${r.title}`, subtitle: `Featured artist and master owner · Prepared ${preparedOn}`,
    sections: [
      { heading: 'Who registers', intro: 'Digital radio (SiriusXM, Pandora, iHeart Radio) pays the featured artist and the master owner separately. Each registers once with SoundExchange, free.',
        rows: [['Featured artist', r.artist.name], ['Master owner', r.owner ? legal(r.owner) : null]] },
      { heading: 'Submit the recording', intro: 'In SoundExchange Direct, go to Repertoire and submit recordings. The ISRC is how SoundExchange matches plays to this recording.',
        rows: [['Artist name', r.artist.name], ['Song title', r.title], ['ISRC', r.isrc], ['Claim basis', r.owner ? 'Copyright owner' : null],
          ['Release title', rel?.title ?? null], ['UPC', rel?.upc ?? null], ['Release date', rel?.releaseDate ?? null],
          ['Owner nationality (optional)', r.owner ? r.owner.citizenship ?? r.owner.domicile : null], ['Length', formatDuration(r.durationS) || null]] },
      { heading: 'Steps', steps: [
        `${r.artist.name}: register as a featured artist at soundexchange.com/register, then claim this recording by ISRC in SoundExchange Direct.`,
        `${r.owner ? legal(r.owner) : 'The master owner'}: register as a sound recording owner, then submit this recording with the details above.`,
        ...(participants.length ? [`${participants.map((c) => c.name).join(', ')} can be paid part of the featured artist’s royalties only through a Letter of Direction. Prepare one from this recording.`] : []),
        'Record each registration in Registrations once SoundExchange confirms it.',
      ] },
    ],
    gaps,
    csv: { name: 'soundexchange-recording.csv', rows: [
      ['ISRC', 'Song title', 'Artist name', 'Claim basis', 'Release title', 'UPC', 'Release date', 'Owner', 'Length'],
      [r.isrc ?? '', r.title, r.artist.name, r.owner ? 'Copyright owner' : '', rel?.title ?? '', rel?.upc ?? '', rel?.releaseDate ?? '', r.owner ? legal(r.owner) : '', formatDuration(r.durationS)],
    ] },
  };
}

/** Producers, mixers, engineers and re-mixers: the creative participants a Letter of Direction can pay. */
const CREATIVE = /produc|mix|engineer/i;
export const lodParticipants = (r: RecordingFacts) => r.credits.filter((c) => CREATIVE.test(c.role) && c.name !== r.artist.name);

/**
 * SoundExchange Featured Artist Letter of Direction (SoundExchange's guide, Aug 2022): the featured
 * artist directs SoundExchange to pay a percentage of their share to one creative participant.
 */
export function sxLod(r: RecordingFacts, preparedOn: string, terms?: LodTerms): PreparedDoc {
  const gaps: Gap[] = [];
  const participants = lodParticipants(r);
  const credit = terms ? participants.find((c) => c.name === terms.payee) : participants[0];
  const payee = credit?.person ?? null;
  if (!participants.length) gaps.push({ severity: 'blocker', field: 'Payee', message: 'No producer, mixer or engineer is credited on this recording. A Letter of Direction can only pay a creative participant.' });
  else if (!credit) gaps.push({ severity: 'blocker', field: 'Payee', message: `${terms?.payee} isn't credited as a producer, mixer or engineer on this recording.` });
  if (!r.isrc) gaps.push({ severity: 'warning', field: 'ISRC', message: `${r.title} has no ISRC. The repertoire chart asks for it where there is one.` });
  if (credit && terms?.percentBp == null) gaps.push({ severity: 'blocker', field: 'Percentage', message: `The percentage of ${r.artist.name}'s share for ${credit.name} isn't set. SoundExchange wants a percentage of the featured artist's share, not points; check the producer agreement.` });
  if (!terms?.effectiveDate && !terms?.allRoyalties) gaps.push({ severity: 'blocker', field: 'Effective date', message: 'Choose an effective date, or that it applies to all royalties for the recording. SoundExchange can’t start the letter without one.' });
  if (r.artist.type === 'group') gaps.push({ severity: 'warning', field: 'Performers', message: `${r.artist.name} is a group. Each performer’s legal name and signature goes on the letter; list every member.` });
  else if (!r.artist.legalName) gaps.push({ severity: 'warning', field: 'Performer legal name', message: `${r.artist.name}'s legal name isn't on file.` });
  if (credit) {
    if (!payee?.address) gaps.push({ severity: 'blocker', field: 'Payee address', message: `${credit.name}'s address isn't on file.` });
    if (!payee?.email) gaps.push({ severity: 'blocker', field: 'Payee email', message: `${credit.name}'s email isn't on file.` });
    gaps.push({ severity: 'warning', field: 'Payee phone', message: `Add ${credit.name}'s phone number on the letter by hand.` });
    if (payee?.type === 'company') gaps.push({ severity: 'warning', field: 'Payee', message: `SoundExchange only pays a company if it is solely owned by the creative participant. Check that ${credit.name} is.` });
  }
  const pct = terms?.percentBp != null ? formatPercent(terms.percentBp) : null;
  const effective = terms?.allRoyalties ? 'All royalties received for this recording' : terms?.effectiveDate ?? null;
  return {
    kind: 'sx_lod', subject: 'recording', subjectId: r.id, title: `Letter of Direction: ${r.title}${credit ? ` for ${credit.name}` : ''}`, subtitle: `SoundExchange featured artist LOD · Prepared ${preparedOn}`,
    sections: [
      { heading: 'Letter of Direction', intro: `${r.artist.name} directs SoundExchange to pay part of their featured artist royalties for the recording below to the payee.`,
        rows: [['Featured artist (solo artist or group)', r.artist.name], ['Performer legal name(s)', r.artist.type === 'group' ? null : legal(r.artist)], ['Effective date', effective],
          ['Payee (producer, mixer or engineer)', credit ? (payee ? legal(payee) : credit.name) : null], ['Payee role', credit?.role ?? null], ['Payee address', payee?.address ?? null], ['Payee telephone', null], ['Payee email', payee?.email ?? null]] },
      { heading: 'Repertoire chart', intro: 'The percentage is of the featured artist’s share, as a percentage, never points.',
        table: { columns: ['Solo Artist or Group Name', 'Sound Recording Track Name', 'Effective Date', 'ISRC', 'Percentage'], rows: [[r.artist.name, r.title, effective, r.isrc, pct]] } },
      { heading: 'Signatures', intro: 'Signed by each performer, or the authorized signatory SoundExchange has on file for them. If signed electronically, send the signing service’s certificate of completion with it.', signatures: r.artist.type === 'group' ? ['Performer', 'Performer'] : [legal(r.artist)] },
      { heading: 'Sending it', steps: [
        'Use SoundExchange’s current Letter of Direction form and repertoire chart (from soundexchange.com or SoundExchange Direct) and copy these details onto them.',
        'Email the signed letter, the chart and any certificate of completion to accounts@soundexchange.com, or upload them in SoundExchange Direct.',
        `${credit?.name ?? 'The payee'} needs a W-9 or W-8 in SoundExchange Direct, or their payments are subject to backup withholding.`,
        'It takes at least two weeks. Record it in Registrations once SoundExchange confirms it.',
      ] },
    ],
    gaps,
    csv: { name: 'lod-repertoire-chart.csv', rows: [['Solo Artist or Group Name', 'Sound Recording Track Name', 'Effective Date', 'ISRC', 'Percentage'], [r.artist.name, r.title, effective ?? '', r.isrc ?? '', pct ?? '']] },
  };
}

/** US Copyright Office: the songs and recordings on one album registered together as a group ($65). */
export function copyrightGroup(r: ReleaseFacts, preparedOn: string): PreparedDoc {
  const gaps: Gap[] = [];
  if (r.kind === 'single') gaps.push({ severity: 'warning', field: 'Release type', message: 'This is a single. The group option is for the works on an album; a single is filed on its own worksheets.' });
  if (!r.releaseDate) gaps.push({ severity: 'blocker', field: 'Release date', message: 'The release date isn’t set. The application asks when the album was published.' });
  if (!r.tracks.length) gaps.push({ severity: 'blocker', field: 'Tracks', message: 'The release has no tracks.' });
  const owners = new Set(r.tracks.map((t) => t.recording.owner?.id ?? null));
  if (owners.has(null)) gaps.push({ severity: 'blocker', field: 'Claimant', message: 'Some tracks have no master owner on file.' });
  if (owners.size > 1) gaps.push({ severity: 'warning', field: 'Claimant', message: 'The tracks don’t all have the same owner. Check on the form whether they can be filed as one group.' });
  for (const t of r.tracks) if (!t.recording.song) gaps.push({ severity: 'warning', field: 'Song', message: `Track ${t.position}, ${t.recording.title}, isn't linked to a song, so its music and lyrics aren't listed.` });
  const owner = r.tracks[0]?.recording.owner ?? null;
  return {
    kind: 'copyright_group', subject: 'release', subjectId: r.id, title: `Copyright, album group: ${r.title}`, subtitle: `Group of works on an album of music · Prepared ${preparedOn}`,
    sections: [
      { heading: 'The album', rows: [['Title', r.title], ['Artist', r.artist.name], ['Published', r.releaseDate ? `${r.releaseDate}, United States` : null], ['Claimant', owner ? legal(owner) : null], ['Claimant address', owner?.address ?? null]] },
      { heading: 'Works on the album', table: { columns: ['#', 'Recording', 'ISRC', 'Song', 'Writers'], rows: r.tracks.map((t) => [String(t.position), t.recording.title, t.recording.isrc, t.recording.song?.title ?? null, t.recording.song ? t.recording.song.writers.map((w) => legal(w.person)).join(', ') : null]) } },
      { heading: 'Filing', rows: [['Application', 'Group of works on an album of music ($65)'], ['Where', 'copyright.gov, Registration Portal']],
        steps: ['Start a new application for a group of works on an album of music, and check the eligibility questions it asks.', 'Copy the album and the works above; upload the album’s audio as the deposit.', 'Record the case number in Registrations.'] },
    ],
    gaps,
    csv: null,
  };
}

/** Builds the requested document, or says why it can't be made for that subject. */
export function prepare(kind: DocKind, facts: { subject: 'work'; song: SongFacts } | { subject: 'recording'; recording: RecordingFacts } | { subject: 'release'; release: ReleaseFacts }, preparedOn: string, opts: PrepareOptions = {}): PreparedDoc | null {
  if (!DOCS_FOR[facts.subject].includes(kind)) return null;
  switch (facts.subject) {
    case 'work': return kind === 'split_sheet' ? splitSheet(facts.song, preparedOn) : kind === 'pro_registration' ? proRegistration(facts.song, preparedOn) : kind === 'mlc_registration' ? mlcRegistration(facts.song, preparedOn) : songCopyright(facts.song, preparedOn);
    case 'recording': return kind === 'sx_registration' ? sxRegistration(facts.recording, preparedOn) : kind === 'sx_lod' ? sxLod(facts.recording, preparedOn, opts.lod) : recordingCopyright(facts.recording, preparedOn);
    case 'release': return kind === 'copyright_group' ? copyrightGroup(facts.release, preparedOn) : labelCopy(facts.release, preparedOn);
  }
}

/** CSV text with every field quoted (names contain commas). */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
}

/** "2 to fix, 1 to check", or "Nothing missing". */
export function gapSummary(gaps: Gap[]): string {
  const b = gaps.filter((g) => g.severity === 'blocker').length;
  const w = gaps.length - b;
  if (!gaps.length) return 'Nothing missing';
  return [b && `${b} to fix`, w && `${w} to check`].filter(Boolean).join(', ');
}
