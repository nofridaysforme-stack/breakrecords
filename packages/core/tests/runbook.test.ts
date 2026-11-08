import { describe, expect, it } from 'vitest';
import { deliveryBlockers, phaseDate, phaseStatus, releaseStatus } from '../src/runbook';

describe('runbook phases', () => {
  it('a relative phase follows the release date; a fixed one does not', () => {
    expect(phaseDate('2027-03-05', { startsOn: null, offsetDays: -56 })).toBe('2027-01-08');
    expect(phaseDate('2027-03-19', { startsOn: null, offsetDays: -56 })).toBe('2027-01-22');
    expect(phaseDate('2027-03-19', { startsOn: '2026-11-06', offsetDays: null })).toBe('2026-11-06');
    expect(() => phaseDate('2027-03-05', { startsOn: null, offsetDays: null })).toThrow();
  });
  it('status comes from the tasks and the date', () => {
    expect(phaseStatus('2026-11-06', [{ state: 'needsYou' }, { state: 'done' }], '2026-11-08')).toBe('now');
    expect(phaseStatus('2027-01-08', [{ state: 'locked' }], '2026-11-08')).toBe('future');
    expect(phaseStatus('2026-10-01', [{ state: 'done' }, { state: 'done' }], '2026-11-08')).toBe('done');
    expect(phaseStatus('2026-10-01', [], '2026-11-08')).toBe('now');
  });
});

describe('release status', () => {
  const now = { iso: '2026-11-06', tasks: [{ state: 'needsYou' as const }, { state: 'done' as const }] };
  const later = { iso: '2027-01-08', tasks: [{ state: 'locked' as const }] };
  it('on track while gates are ahead and nothing has waited too long', () => {
    expect(releaseStatus([now, later], 186000, 300000, '2026-11-08')).toBe('onTrack');
  });
  it('blocked when a gate is still locked once its phase starts', () => {
    expect(releaseStatus([now, later], 186000, 300000, '2027-01-09')).toBe('blocked');
  });
  it('at risk when over budget, or a decision has waited more than two weeks', () => {
    expect(releaseStatus([now], 300001, 300000, '2026-11-08')).toBe('atRisk');
    expect(releaseStatus([now], 0, 300000, '2026-11-21')).toBe('atRisk');
    expect(releaseStatus([now], 0, 300000, '2026-11-20')).toBe('onTrack');
  });
  it('blockers are the unfinished tasks that say why', () => {
    expect(deliveryBlockers([
      { state: 'locked', blocksDelivery: 'Split sheets: not signed.' }, { state: 'done', blocksDelivery: 'Cover art: missing.' }, { state: 'waiting', blocksDelivery: null },
    ])).toEqual(['Split sheets: not signed.']);
  });
});
