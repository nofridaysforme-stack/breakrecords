import { describe, expect, it } from 'vitest';
import { goalArea, labelHeadPlan, MAX_STEPS, planProgress, type OpenFinding } from '../src/labelHead';

const f = (key: string, dept: string, rule: string, extra: Partial<OpenFinding> = {}): OpenFinding => ({ key, dept, agent: `${dept} agent`, rule, title: key, href: `/${dept}`, approvalId: null, ...extra });

describe('Label Head', () => {
  it('reads the area of a goal from its words', () => {
    expect(goalArea('Get everything registered with the MLC')).toBe('registrations');
    expect(goalArea("Find money I'm owed")).toBe('money');
    expect(goalArea('Make sure everyone gets paid')).toBe('payees');
    expect(goalArea('Get the EP ready to release')).toBe('release');
    expect(goalArea('Clean up the catalog credits')).toBe('catalog');
    expect(goalArea('What should I do this week?')).toBe('everything');
  });

  it('builds phases from open findings, cards first as waiting on you, and never invents a step', () => {
    const open = [
      f('rights:pro:a', 'rights', 'RGT-01', { approvalId: 'reg_pro_a' }),
      f('metadata:isrc:a', 'metadata', 'MET-01'),
      f('royalties:match:x', 'royalties', 'ROY-21'),
    ];
    const p = labelHeadPlan('register my songs', open, true);
    expect(p.title).toBe('Get everything registered');
    expect(p.phases.map((ph) => [ph.name, ph.steps.map((s) => s.key)])).toEqual([['Get the facts right', ['metadata:isrc:a']], ['File the registrations', ['rights:pro:a']]]);
    expect(p.phases[1].steps[0]).toMatchObject({ href: '/approvals/reg_pro_a', waitingOnYou: true });
    const all = labelHeadPlan('what now', open, true);
    expect(all.phases[0]).toMatchObject({ name: 'Waiting on your approval', steps: [{ key: 'rights:pro:a' }] });
    expect(all.phases.flatMap((ph) => ph.steps).map((s) => s.key)).toHaveLength(3);
  });

  it('says so when there is nothing to plan, or the agents have not run, and caps a plan', () => {
    expect(labelHeadPlan('register', [], true).empty).toMatch(/Nothing is open/);
    expect(labelHeadPlan('register', [], false).assumptions[0]).toMatch(/haven’t run yet/);
    const many = Array.from({ length: MAX_STEPS + 5 }, (_, i) => f(`metadata:isrc:${i}`, 'metadata', 'MET-01'));
    const p = labelHeadPlan('tidy the catalog', many, true);
    expect(p.phases[0].steps).toHaveLength(MAX_STEPS);
    expect(p.assumptions[0]).toMatch(/takes the first 15/);
  });

  it('counts progress as steps whose findings are no longer open', () => {
    expect(planProgress(['a', 'b', 'c'], new Set(['b']))).toEqual({ done: 2, total: 3 });
  });
});
