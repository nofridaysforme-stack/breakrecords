// The Label Head, rules first: a goal in plain words becomes a plan built from what the agents
// actually found open, in order, each step linking to where it's done. No model: it reads the
// kind of goal from its words, says what it assumed, and never makes up a step.

export type OpenFinding = { key: string; dept: string; agent: string; rule: string; title: string; href: string | null; approvalId: string | null };
export type GoalArea = 'registrations' | 'money' | 'release' | 'payees' | 'catalog' | 'everything';
export type PlanStep = { key: string; title: string; agent: string; href: string; waitingOnYou: boolean };
export type LabelHeadPlan = { area: GoalArea; title: string; phases: { name: string; steps: PlanStep[] }[]; assumptions: string[]; empty: string | null };

/** Most steps in one plan: a plan is something a person can work through in a sitting or two. */
export const MAX_STEPS = 15;

const AREA_WORDS: [GoalArea, RegExp][] = [
  ['registrations', /\b(regist\w*|pro|ascap|bmi|mlc|soundexchange|copyright|fil(e|ing))\b/i],
  ['money', /\b(owed|unclaimed|royalt\w*|income|statement\w*|unmatched|money)\b/i],
  ['payees', /\b(pay(ee|ees|out|outs|ing)?|paid|tax|w-?9|w-?8|bank|split\w*|sign\w*)\b/i],
  ['release', /\b(release|launch|drop|single|ep|album|cover|master\w*|deliver\w*)\b/i],
  ['catalog', /\b(metadata|catalog|credits?|isrc|genre|clean ?up|tidy)\b/i],
];

/** Which agents' work a goal is about, from its words; "everything" when it doesn't say. */
export function goalArea(goal: string): GoalArea {
  for (const [area, re] of AREA_WORDS) if (re.test(goal)) return area;
  return 'everything';
}

const PHASES: Record<GoalArea, { name: string; depts: string[] }[]> = {
  registrations: [{ name: 'Get the facts right', depts: ['metadata'] }, { name: 'File the registrations', depts: ['rights'] }],
  money: [{ name: 'Collect what’s waiting', depts: ['rights'] }, { name: 'Match and check statements', depts: ['royalties', 'audit'] }],
  payees: [{ name: 'Splits signed', depts: ['artist-relations', 'royalties'] }],
  release: [{ name: 'Before release day', depts: ['release'] }, { name: 'Metadata and codes', depts: ['metadata'] }, { name: 'Registrations', depts: ['rights'] }],
  catalog: [{ name: 'Fill in the catalog', depts: ['metadata'] }],
  everything: [
    { name: 'Waiting on your approval', depts: [] },
    { name: 'Money', depts: ['royalties', 'audit', 'artist-relations'] },
    { name: 'Releases', depts: ['release'] },
    { name: 'Registrations', depts: ['rights'] },
    { name: 'Catalog', depts: ['metadata'] },
  ],
};

const TITLE: Record<GoalArea, string> = {
  registrations: 'Get everything registered', money: 'Collect money you’re owed', payees: 'Get everyone paid',
  release: 'Get the release ready', catalog: 'Tidy up the catalog', everything: 'Clear what’s open',
};

/** Payees steps also cover tax forms and bank details (Roster) and unsplit income (Royalties ROY-23). */
const PAYEE_RULES = new Set(['ROS-21', 'ROS-22', 'ROS-23', 'ROY-23', 'ROY-24']);

export function labelHeadPlan(goal: string, open: OpenFinding[], agentsRan: boolean): LabelHeadPlan {
  const area = goalArea(goal);
  const assumptions: string[] = [];
  if (area === 'everything') assumptions.push('Your goal didn’t name an area, so this covers everything the agents have open.');
  if (!agentsRan) assumptions.push('The agents haven’t run yet, so there’s nothing to plan from. Run them on Departments first.');
  const used = new Set<string>();
  const step = (f: OpenFinding): PlanStep => ({ key: f.key, title: f.title, agent: f.agent, href: f.approvalId ? `/approvals/${f.approvalId}` : f.href ?? '/departments', waitingOnYou: !!f.approvalId });
  let left = MAX_STEPS;
  const phases = PHASES[area].map((ph) => {
    const pick = open.filter((f) => !used.has(f.key) && (ph.depts.length ? ph.depts.includes(f.dept) && (area !== 'payees' || PAYEE_RULES.has(f.rule)) : !!f.approvalId));
    const steps = pick.slice(0, Math.max(0, left)).map((f) => { used.add(f.key); return step(f); });
    left -= steps.length;
    return { name: ph.name, steps };
  }).filter((ph) => ph.steps.length);
  const total = open.filter((f) => PHASES[area].some((ph) => ph.depts.length ? ph.depts.includes(f.dept) && (area !== 'payees' || PAYEE_RULES.has(f.rule)) : !!f.approvalId)).length;
  if (total > MAX_STEPS) assumptions.push(`There are ${total} things open here; the plan takes the first ${MAX_STEPS}. Approve it, work through them, and ask again for the rest.`);
  const empty = phases.length ? null : agentsRan ? 'Nothing is open for this goal. The agents will raise anything new on their next run.' : 'The agents haven’t run yet.';
  return { area, title: TITLE[area], phases, assumptions, empty };
}

/** A plan's progress: its steps whose findings are no longer open. */
export function planProgress(stepKeys: string[], openKeys: Set<string>): { done: number; total: number } {
  return { done: stepKeys.filter((k) => !openKeys.has(k)).length, total: stepKeys.length };
}
