import { describe, expect, it } from 'vitest';
import { gapSummary, labelCopy, mlcShares, prepare, proShares, recordingCopyright, recordingPacket, songCopyright, songPacket, splitSheet, toCsv, type Person, type RecordingFacts, type SongFacts } from '../src/documents';

const person = (id: string, over: Partial<Person> = {}): Person => ({
  id, name: id, type: 'person', legalName: `${id} Legal`, pro: 'ascap', ipi: '00712345678', email: null, address: '1 Main St', citizenship: 'US', domicile: 'US', ...over,
});
const pub = person('Pub', { type: 'company' });
const song = (over: Partial<SongFacts> = {}): SongFacts => ({
  id: 'w1', title: 'Glasshouse', iswc: null, altTitles: [], completionYear: 2026, hasLyrics: true,
  writers: [
    { person: person('Kesi'), shareBp: 7500, confirmed: true, role: 'composer_lyricist', publisher: pub },
    { person: person('Marco'), shareBp: 2500, confirmed: false, role: 'composer', publisher: null },
  ],
  recordings: [{ title: 'Glasshouse', isrc: 'USNL12600014', artist: 'Kesi', durationS: 222 }],
  ...over,
});
const recording = (over: Partial<RecordingFacts> = {}): RecordingFacts => ({
  id: 'r1', title: 'Glasshouse', isrc: 'USNL12600014', durationS: 222, genre: 'R&B', artist: person('Kesi'), owner: person('Label', { type: 'company' }), pYear: 2027,
  credits: [{ name: 'Marco', role: 'Producer' }], song: song(), releases: [{ title: 'Glasshouse', kind: 'single', upc: '196922410013', releaseDate: '2027-03-05' }], ...over,
});
const fields = (gaps: { field: string }[]) => gaps.map((g) => g.field);

describe('split sheet', () => {
  it('lists every writer with a signature line and a 100% total', () => {
    const d = splitSheet(song(), 'Nov 9, 2026');
    expect(d.title).toBe('Split sheet: Glasshouse');
    const table = d.sections[1].table!;
    expect(table.rows.at(-1)).toEqual(['Total', '', '', '', '', '100.00%']);
    expect(d.sections[2].signatures).toEqual(['Kesi Legal', 'Marco Legal']);
    expect(fields(d.gaps)).toEqual(['Signatures']);
  });
  it('shares that don’t total 100% are a blocker, and missing facts are gaps, never guesses', () => {
    const d = splitSheet(song({ writers: [{ person: person('Kesi', { pro: null, ipi: null, legalName: null }), shareBp: 9000, confirmed: true, role: null, publisher: null }] }), 'x');
    expect(d.gaps.find((g) => g.field === 'Shares')).toMatchObject({ severity: 'blocker', message: 'Writer shares add up to 90%, not 100%.' });
    expect(fields(d.gaps)).toEqual(expect.arrayContaining(['Legal name', 'Role', 'PRO', 'IPI']));
    expect(d.sections[1].table!.rows[0]).toEqual(['Kesi', null, null, null, 'None', '90.00%']);
  });
});

describe('registration packets', () => {
  it('splits performance shares 50/50 between writers and publishers; an odd basis point goes to the writer', () => {
    const s = song({ writers: [{ person: person('A'), shareBp: 3333, confirmed: true, role: 'composer', publisher: pub }] });
    expect(proShares(s).map((x) => [x.writerBp, x.publisherBp])).toEqual([[1667, 1666]]);
    const all = proShares(song());
    expect(all.reduce((a, x) => a + x.writerBp + x.publisherBp, 0)).toBe(10000);
  });
  it('MLC shares total 100%, claimed by the publisher or by a self-administered writer', () => {
    expect(mlcShares(song()).map((o) => [o.owner.id, o.selfAdministered, o.shareBp])).toEqual([['Pub', false, 7500], ['Marco', true, 2500]]);
  });
  it('a writer with no publisher is flagged; the CSV has a row per writer and publisher', () => {
    const d = songPacket(song(), 'x');
    expect(d.gaps.find((g) => g.field === 'Publisher')?.message).toMatch(/Marco has no publisher/);
    expect(d.csv!.rows).toHaveLength(1 + 3);
    expect(d.sections[1].steps![0]).toMatch(/^ASCAP: sign in/);
  });
  it('a recording without an ISRC or owner can’t be claimed at SoundExchange', () => {
    const d = recordingPacket(recording({ isrc: null, owner: null }), 'x');
    expect(d.gaps.filter((g) => g.severity === 'blocker').map((g) => g.field)).toEqual(['ISRC', 'Owner']);
    expect(d.sections[1].steps!.some((s) => s.includes('Letter of Direction'))).toBe(true);
  });
});

describe('copyright worksheets', () => {
  it('a song needs each author’s citizenship or home country', () => {
    const d = songCopyright(song({ writers: [{ person: person('Kesi', { citizenship: null, domicile: null }), shareBp: 10000, confirmed: true, role: 'lyricist', publisher: null }] }), 'x');
    expect(d.gaps.find((g) => g.field === 'Citizenship')?.severity).toBe('blocker');
    expect(d.sections[1].table!.rows[0][3]).toBe('Lyrics');
    expect(d.sections[3].rows![0][1]).toMatch(/Single Application \(\$45\)/);
  });
  it('a label-owned master asks how ownership passed from the artist', () => {
    const d = recordingCopyright(recording(), 'x');
    expect(d.gaps.map((g) => g.field)).toEqual(['Transfer']);
    expect(d.sections[0].rows).toContainEqual(['Published', 'Yes, 2027-03-05, United States']);
  });
});

describe('label copy and helpers', () => {
  it('lists tracks with writers, and builds ℗ and © lines from the release year', () => {
    const d = labelCopy({ id: 'rel', title: 'Glasshouse', kind: 'single', upc: '196922410013', releaseDate: '2027-03-05', artist: person('Kesi'), labelName: 'Northline Records', tracks: [{ position: 1, recording: recording() }] }, 'x');
    expect(d.sections[0].rows).toContainEqual(['℗ line', '℗ 2027 Label Legal']);
    expect(d.sections[1].table!.rows[0][4]).toBe('Kesi Legal 75%; Marco Legal 25%');
    expect(d.gaps).toEqual([]);
  });
  it('a document only exists for subjects it applies to', () => {
    expect(prepare('label_copy', { subject: 'work', song: song() }, 'x')).toBeNull();
    expect(prepare('split_sheet', { subject: 'work', song: song() }, 'x')?.kind).toBe('split_sheet');
  });
  it('CSV quotes every field; gap summaries are plain words', () => {
    expect(toCsv([['a,b', 'say "hi"']])).toBe('"a,b","say ""hi"""\r\n');
    expect(gapSummary([])).toBe('Nothing missing');
    expect(gapSummary([{ severity: 'blocker', field: 'x', message: '' }, { severity: 'warning', field: 'y', message: '' }])).toBe('1 to fix, 1 to check');
  });
});
