import { describe, expect, it } from 'vitest';
import { gapSummary, mlcRegistration, proRegistration, sxLod, sxRegistration, labelCopy, mlcShares, prepare, proShares, recordingCopyright, recordingPacket, songCopyright, songPacket, splitSheet, toCsv, type Person, type RecordingFacts, type SongFacts } from '../src/documents';

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

describe('a form for each organization', () => {
  it('PRO: ASCAP splits 50/50 writers and publishers; BMI counts each to 100% and shows Manuscript for no publisher', () => {
    const s = song({ writers: [
      { person: person('Kesi'), shareBp: 7500, confirmed: true, role: 'composer_lyricist', publisher: pub },
      { person: person('Marco', { pro: 'bmi' }), shareBp: 2500, confirmed: true, role: 'composer', publisher: null },
    ] });
    const d = proRegistration(s, 'x');
    const ascap = d.sections.find((x) => x.heading === 'ASCAP: register the song')!;
    const bmi = d.sections.find((x) => x.heading === 'BMI: register the song')!;
    expect(ascap.table!.rows.map((r) => r[4])).toEqual(['37.50%', '37.50%', '12.50%', '12.50%']);
    expect(bmi.table!.rows.map((r) => [r[0], r[4]])).toEqual([['Kesi Legal', '75.00%'], ['Pub Legal', '75.00%'], ['Marco Legal', '25.00%'], ['Manuscript (no publisher)', '25.00%']]);
    expect(bmi.steps![0]).toMatch(/Add New Work/);
    expect(d.csv!.rows).toHaveLength(1 + 8);
  });
  it('MLC: the six steps, role codes, a composer is required, and bulk only with a publisher IPI', () => {
    const d = mlcRegistration(song(), 'x');
    expect(d.sections.map((x) => x.heading.split(':')[0])).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Registering many songs at once']);
    expect(d.sections[2].table!.rows.map((r) => r[2])).toEqual(['CA', 'C']);
    expect(d.sections[3].table!.rows.map((r) => [r[0], r[1], r[3]])).toEqual([['Pub Legal', 'Publisher', '75.00%'], ['Marco Legal', 'Self-administered (your Member account)', '25.00%']]);
    expect(d.sections[6].intro).toMatch(/Bulk Registration Tool/);
    expect(d.csv!.rows[1][0]).toBe('Glasshouse');
    expect(d.csv!.rows[2][0]).toBe(''); // a second writer leaves the work columns empty
    const lyricsOnly = mlcRegistration(song({ writers: [{ person: person('A'), shareBp: 10000, confirmed: true, role: 'lyricist', publisher: null }] }), 'x');
    expect(lyricsOnly.gaps.find((g) => g.field === 'Writer role')?.severity).toBe('blocker');
    expect(lyricsOnly.sections[6].intro).toMatch(/needs a publisher IPI/);
  });
  it('SoundExchange: ISRC, owner and a release are needed; producers are pointed to a Letter of Direction', () => {
    const d = sxRegistration(recording({ isrc: null, owner: null, releases: [] }), 'x');
    expect(d.gaps.filter((g) => g.severity === 'blocker').map((g) => g.field)).toEqual(['ISRC', 'Owner', 'Release']);
    expect(sxRegistration(recording(), 'x').sections[2].steps!.some((s) => s.includes('Letter of Direction'))).toBe(true);
  });
  it('Letter of Direction: a percentage of the artist’s share and an effective date, payee details, never a non-creative payee', () => {
    const marco = person('Marco', { email: 'marco@example.com' });
    const r = recording({ credits: [{ name: 'Marco', role: 'Producer', person: marco }, { name: 'Ann', role: 'Background vocals', person: person('Ann') }] });
    const bare = sxLod(r, 'x');
    expect(bare.gaps.filter((g) => g.severity === 'blocker').map((g) => g.field)).toEqual(['Percentage', 'Effective date']);
    const d = sxLod(r, 'x', { payee: 'Marco', percentBp: 300, effectiveDate: '2027-03-05', allRoyalties: false });
    expect(d.gaps.filter((g) => g.severity === 'blocker')).toEqual([]);
    expect(d.csv!.rows[1]).toEqual(['Kesi', 'Glasshouse', '2027-03-05', 'USNL12600014', '3%']);
    expect(d.sections[0].rows!.find((x) => x[0] === 'Payee email')![1]).toBe('marco@example.com');
    expect(sxLod(r, 'x', { payee: 'Ann', percentBp: 100, effectiveDate: null, allRoyalties: true }).gaps.find((g) => g.field === 'Payee')?.message).toMatch(/isn't credited as a producer/);
    expect(sxLod(recording({ credits: [] }), 'x').gaps[0].message).toMatch(/No producer, mixer or engineer/);
  });
  it('the forms are offered for the right things', () => {
    expect(prepare('mlc_registration', { subject: 'work', song: song() }, 'x')?.kind).toBe('mlc_registration');
    expect(prepare('sx_lod', { subject: 'recording', recording: recording() }, 'x')?.kind).toBe('sx_lod');
    expect(prepare('sx_lod', { subject: 'work', song: song() }, 'x')).toBeNull();
    expect(prepare('registration_packet', { subject: 'work', song: song() }, 'x')).toBeNull(); // replaced by the forms above
  });
});
