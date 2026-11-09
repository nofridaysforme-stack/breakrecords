// Prepared documents: what each one says, built only from the catalog's own facts. A fact that
// is missing is never guessed: it becomes a gap, listed on the document and saved with it.
// What each organization asks for, and where that was read, is in docs/RIGHTS_REQUIREMENTS.md.
// Rendering (PDF, CSV) and storage live in the app; this file is pure.

import { FULL, formatPercent, type Bp } from './percent';
import { formatDuration } from './metadata';

export type Pro = 'ascap' | 'bmi' | 'sesac' | 'gmr' | 'socan' | 'prs' | 'other' | 'none';
export type WriterRole = 'composer' | 'lyricist' | 'composer_lyricist';
export type DocKind = 'split_sheet' | 'registration_packet' | 'copyright_worksheet' | 'label_copy';
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
  credits: { name: string; role: string }[];
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
};
export const PRO_LABEL: Record<Pro, string> = { ascap: 'ASCAP', bmi: 'BMI', sesac: 'SESAC', gmr: 'GMR', socan: 'SOCAN', prs: 'PRS', other: 'Other', none: 'Not a member' };
export const ROLE_LABEL: Record<WriterRole, string> = { composer: 'Music', lyricist: 'Lyrics', composer_lyricist: 'Music and lyrics' };

/** Which documents a subject can have. */
export const DOCS_FOR: Record<DocSubject, DocKind[]> = {
  work: ['split_sheet', 'registration_packet', 'copyright_worksheet'],
  recording: ['registration_packet', 'copyright_worksheet'],
  release: ['label_copy'],
};

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
  const single = s.writers.length === 1;
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
        rows: [['Application', single ? 'Single Application ($45) if the one writer is also the claimant, or Standard Application ($65)' : 'Standard Application ($65)'], ['Where', 'copyright.gov, Registration Portal']],
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
        rows: [['Application', 'Standard Application ($65). Songs and recordings on one album can also be filed as a group ($65).'], ['Where', 'copyright.gov, Registration Portal']],
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

/** Builds the requested document, or says why it can't be made for that subject. */
export function prepare(kind: DocKind, facts: { subject: 'work'; song: SongFacts } | { subject: 'recording'; recording: RecordingFacts } | { subject: 'release'; release: ReleaseFacts }, preparedOn: string): PreparedDoc | null {
  if (!DOCS_FOR[facts.subject].includes(kind)) return null;
  switch (facts.subject) {
    case 'work': return kind === 'split_sheet' ? splitSheet(facts.song, preparedOn) : kind === 'registration_packet' ? songPacket(facts.song, preparedOn) : songCopyright(facts.song, preparedOn);
    case 'recording': return kind === 'registration_packet' ? recordingPacket(facts.recording, preparedOn) : recordingCopyright(facts.recording, preparedOn);
    case 'release': return labelCopy(facts.release, preparedOn);
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
