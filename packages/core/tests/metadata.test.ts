import { describe, expect, it } from 'vitest';
import { aiUseFromLabel, aiUseLabel, formatDuration, metadataScore, type MetadataInput } from '../src/metadata';

const full: MetadataInput = {
  title: 'Night Bus', artist: 'The Low Hours', isrc: 'USNL12500031', durationS: 245, genre: 'Indie rock', aiUse: 'none',
  hasSong: true, iswc: 'T-931.204.118-6', writersConfirmed: true, hasLyrics: true, contributorCredits: 3, upc: '196922410020',
};

describe('metadata completeness', () => {
  it('a complete recording scores 100 with nothing missing', () => {
    expect(metadataScore(full)).toEqual({ score: 100, missing: [], note: 'Nothing missing.' });
  });
  it('one gap of twelve rounds down to 91', () => {
    const r = metadataScore({ ...full, iswc: null }, 'Publishing Agent will add it once the MLC filing is confirmed.');
    expect(r.score).toBe(91);
    expect(r.note).toBe('Missing the ISWC. Publishing Agent will add it once the MLC filing is confirmed.');
  });
  it('lists several gaps in plain words', () => {
    const r = metadataScore({ ...full, isrc: null, genre: null, upc: null });
    expect(r.score).toBe(75);
    expect(r.note).toBe('Missing the ISRC, genre and release with a UPC.');
  });
  it('an undeclared AI use counts as a gap; "None" is a declaration', () => {
    expect(metadataScore({ ...full, aiUse: 'undeclared' }).missing).toEqual(['AI use declaration']);
    expect(aiUseLabel('partial_stems')).toBe('Partial, stems');
    expect(aiUseFromLabel('Partial, stems')).toBe('partial_stems');
    expect(aiUseFromLabel('Made up')).toBeNull();
  });
  it('formats durations', () => {
    expect(formatDuration(222)).toBe('3:42');
    expect(formatDuration(null)).toBe('');
  });
});
