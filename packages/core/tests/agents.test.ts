import { describe, expect, it } from 'vitest';
import { deptState, MAX_CARDS_PER_RUN, planRun, runSummary, type Dept, type Finding } from '../src/agents';
import { metadataFindings, rightsFindings } from '../src/agentRules';

const dept = (slug: string, autonomy: Dept['autonomy'], canAct = true): Dept => ({ slug, agent: `${slug} agent`, autonomy, canAct });
const f = (key: string, extra: Partial<Finding> = {}): Finding => ({ dept: 'rights', key, rule: 'RGT-01', title: key, detail: '', href: '/x', ...extra });

describe('planRun', () => {
  it('opens new findings once, keeps those still seen, and closes those gone', () => {
    const p = planRun([f('a'), f('b'), f('a')], [{ key: 'b', status: 'open', approvalId: null, fixed: false }, { key: 'c', status: 'open', approvalId: null, fixed: false }], [dept('rights', 'suggest')]);
    expect(p.open.map((x) => x.key)).toEqual(['a']);
    expect(p.keep).toEqual(['b']);
    expect(p.close).toEqual(['c']);
  });
  it('a dismissed finding stays quiet, and a resolved one reopens', () => {
    const p = planRun([f('a'), f('b')], [{ key: 'a', status: 'dismissed', approvalId: null, fixed: false }, { key: 'b', status: 'resolved', approvalId: null, fixed: false }], [dept('rights', 'suggest')]);
    expect(p.open.map((x) => x.key)).toEqual(['b']);
    expect(p.keep).toEqual([]);
  });
  it('cards go to Approvals only when the department drafts, once, and only so many a run', () => {
    const card = { kind: 'registration', args: {} };
    expect(planRun([f('a', { card })], [], [dept('rights', 'suggest')]).cards).toEqual([]);
    expect(planRun([f('a', { card })], [], [dept('rights', 'observe')]).cards).toEqual([]);
    expect(planRun([f('a', { card })], [], [dept('rights', 'draft_and_wait')]).cards).toHaveLength(1);
    expect(planRun([f('a', { card })], [{ key: 'a', status: 'open', approvalId: 'reg_x', fixed: false }], [dept('rights', 'draft_and_wait')]).cards).toEqual([]);
    const many = Array.from({ length: MAX_CARDS_PER_RUN + 3 }, (_, i) => f(`k${i}`, { card }));
    expect(planRun(many, [], [dept('rights', 'draft_and_wait')]).cards).toHaveLength(MAX_CARDS_PER_RUN);
  });
  it('fixes only with Act within limits on a department allowed to act', () => {
    const fix = { kind: 'set_p_year', args: {} };
    const m = (autonomy: Dept['autonomy'], canAct = true) => planRun([f('a', { dept: 'metadata', fix })], [], [dept('metadata', autonomy, canAct)]).fixes.length;
    expect(m('act_within_limits')).toBe(1);
    expect(m('draft_and_wait')).toBe(0);
    expect(m('act_within_limits', false)).toBe(0);
  });
  it('an inactive department does nothing', () => {
    expect(planRun([f('a')], [], [dept('rights', null)]).open).toEqual([]);
  });
});

describe('department state and the run summary', () => {
  it('waiting cards come first, then open findings', () => {
    expect(deptState(3, 1)).toBe('waitingOnYou');
    expect(deptState(3, 0)).toBe('working');
    expect(deptState(0, 0)).toBe('done');
  });
  it('says what changed in one sentence, or nothing', () => {
    expect(runSummary('Rights Agent', { opened: 2, closed: 1, cards: 2, fixes: 0 })).toBe('Rights Agent found 2 new things to look at, put 2 cards in Approvals and saw 1 thing resolved.');
    expect(runSummary('Rights Agent', { opened: 0, closed: 0, cards: 0, fixes: 0 })).toBeNull();
  });
});

describe('Metadata Agent', () => {
  const r = { id: 'low-light', title: 'Low Light', onRelease: true, isrc: null, genre: null, durationS: null, hasOwner: false, pYear: null, firstReleaseYear: 2026, aiDeclared: false, contributors: 0 };
  it('finds what a released recording is missing, and offers the ℗ year as a fix', () => {
    const out = metadataFindings({ recordings: [r], people: [] });
    expect(out.map((x) => x.rule)).toEqual(['MET-01', 'MET-02', 'MET-03', 'MET-04', 'MET-05', 'MET-06', 'MET-07']);
    expect(out.find((x) => x.rule === 'MET-05')!.fix).toEqual({ kind: 'set_p_year', args: { recording: 'low-light', year: 2026 } });
    expect(out[0].href).toBe('/catalog/recordings?edit=low-light');
  });
  it('asks only for an ISRC on an unreleased recording, and for people on the catalog', () => {
    const out = metadataFindings({ recordings: [{ ...r, onRelease: false }], people: [{ id: 'ivy', name: 'Ivy', missing: ['Email'], onCatalog: true }, { id: 'x', name: 'X', missing: ['Email'], onCatalog: false }] });
    expect(out.map((x) => x.key)).toEqual(['metadata:isrc:low-light', 'metadata:person:ivy']);
  });
});

describe('Rights Agent', () => {
  it('prepares filings for released music, never for unreleased, and SoundExchange only with an ISRC', () => {
    const out = rightsFindings({
      songs: [{ id: 'glass', title: 'Glass', released: true, pro: 'prepare', mlc: 'approve' }, { id: 'demo', title: 'Demo', released: false, pro: 'prepare', mlc: 'prepare' }],
      recordings: [{ id: 'glass-r', title: 'Glass', released: true, sxOwner: 'prepare', sxArtist: 'confirmed', isrc: true }, { id: 'no-code', title: 'No Code', released: true, sxOwner: 'prepare', sxArtist: 'prepare', isrc: false }],
      approvedWaiting: [{ approvalId: 'reg_mlc_x', title: 'Register X with The MLC', days: 9 }, { approvalId: 'reg_pro_y', title: 'Y', days: 2 }],
      unclaimed: [{ id: 'u1', what: 'Night Bus', source: 'SoundExchange', amountCents: 100 }],
    });
    expect(out.map((x) => x.key)).toEqual(['rights:pro:glass', 'rights:mlc:glass', 'rights:sx_owner:glass-r', 'rights:submit:reg_mlc_x', 'rights:unclaimed:u1']);
    expect(out[0].card).toEqual({ kind: 'registration', args: { org: 'pro', subject: 'work', id: 'glass' } });
    expect(out[1].card).toBeUndefined(); // already waiting on approval: kept open, no second card
  });
});
