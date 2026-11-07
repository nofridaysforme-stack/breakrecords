// Turns a plain-language goal into a first-draft plan (flows.md > Core loop, step 2).
// The mock Label Head is a set of rules, not a model: it reads the kind of work, a budget
// and a month, and says plainly what it assumed.
import { toCents, type Cents } from '@breakrecords/core/money';
import { addDays, toIso } from '@breakrecords/core/dates';

export type GoalKind = 'release' | 'money' | 'splits' | 'grants' | 'general';
export type ParsedGoal = { text: string; kind: GoalKind; format: string | null; budget: Cents | null; month: number | null };
export type PlanTask = { title: string; owner: string };
export type DraftPlan = {
  kind: GoalKind; title: string; budget: Cents | null; budgetAssumed: boolean;
  dates: string; approvals: number; phases: { name: string; date: string; tasks: PlanTask[] }[];
  assumptions: string[];
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Words that mark a request to do something, so the command bar offers to plan it. */
const VERBS = /^(plan|release|put out|drop|launch|find|set up|setup|apply|get|start|make|record|register|claim|book|organi[sz]e|prepare|build|sign|help)\b/i;

export function looksLikeGoal(q: string) {
  const t = q.trim();
  return VERBS.test(t) || t.split(/\s+/).length >= 5;
}

export function parseGoal(text: string): ParsedGoal {
  const t = text.toLowerCase();
  const format = /\balbum\b|\blp\b/.test(t) ? 'album' : /\bep\b/.test(t) ? 'EP' : /\bsingle\b|\bsong\b|\btrack\b/.test(t) ? 'single' : null;
  const kind: GoalKind = /grant|funding|fund\b/.test(t) ? 'grants'
    : /owed|unclaimed|royalt|money i/.test(t) ? 'money'
    : /split/.test(t) ? 'splits'
    : format || /release|drop|put out|launch/.test(t) ? 'release' : 'general';
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k\b)?/i.exec(text);
  const budget = m ? toCents(Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)) : null;
  const mi = MONTHS.findIndex((name) => new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t));
  return { text: text.trim(), kind, format, budget, month: mi >= 0 ? mi : null };
}

/** First Friday of the month, the next time that month comes round after today. */
function releaseDay(month: number, todayIso: string) {
  const today = new Date(`${todayIso}T12:00:00Z`);
  let year = today.getUTCFullYear();
  if (month <= today.getUTCMonth()) year += 1;
  const d = new Date(Date.UTC(year, month, 1, 12));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return toIso(d);
}

const short = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${SHORT[m - 1]} ${d}`; };
const fmt = (c: Cents) => '$' + Math.round(c / 100).toLocaleString('en-US');

export function draftPlan(text: string, todayIso: string): DraftPlan {
  const g = parseGoal(text);
  const assumptions: string[] = [];

  if (g.kind === 'release') {
    const format = g.format ?? 'single';
    if (!g.format) assumptions.push('You didn’t say single, EP or album, so I planned a single.');
    const defaults: Record<string, number> = { single: 3000, EP: 6000, album: 15000 };
    const budget = g.budget ?? toCents(defaults[format]);
    if (!g.budget) assumptions.push(`No budget given. ${fmt(budget)} is typical for your past ${format === 'single' ? 'singles' : 'releases'}; change it if you like.`);
    let date: string;
    if (g.month !== null) date = releaseDay(g.month, todayIso);
    else { date = addDays(todayIso, 16 * 7); while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) date = addDays(date, 1); assumptions.push('No date given, so I picked a Friday about 16 weeks out, enough time for pitching.'); }
    const at = (weeks: number) => short(addDays(date, -weeks * 7));
    return {
      kind: g.kind, title: `Release ${format === 'single' ? 'a' : 'an'} ${format} on ${short(date)}`,
      budget, budgetAssumed: !g.budget, dates: `${short(todayIso)} to ${short(date)}`, approvals: 4, assumptions,
      phases: [
        { name: 'Now', date: short(todayIso), tasks: [{ title: 'Confirm budget and date', owner: 'You' }, { title: 'Draft split sheets', owner: 'Legal Agent' }] },
        { name: '8 weeks out', date: at(8), tasks: [{ title: 'Split sheets signed', owner: 'Legal Agent' }, { title: 'Masters delivered', owner: 'Artist' }] },
        { name: '6 weeks out', date: at(6), tasks: [{ title: 'ISRC and UPC assigned', owner: 'Metadata Agent' }, { title: 'Cover art final', owner: 'Release Agent' }] },
        { name: '4 weeks out', date: at(4), tasks: [{ title: 'Deliver to distributor', owner: 'Distribution Agent' }] },
        { name: '2 weeks out', date: at(2), tasks: [{ title: 'Pitch to playlists', owner: 'Release Agent' }] },
        { name: 'Release week', date: short(date), tasks: [{ title: 'Release goes live', owner: 'Distribution Agent' }, { title: 'Register with PRO, MLC and SoundExchange', owner: 'Publishing Agent' }] },
      ],
    };
  }

  if (g.kind === 'money') {
    return {
      kind: g.kind, title: 'Find money you’re owed', budget: null, budgetAssumed: false, dates: `${short(todayIso)} to ${short(addDays(todayIso, 21))}`, approvals: 2, assumptions,
      phases: [
        { name: 'This week', date: short(todayIso), tasks: [{ title: 'Search SoundExchange and the MLC for unclaimed royalties', owner: 'Rights Agent' }, { title: 'Check every recording is registered', owner: 'Rights Agent' }] },
        { name: 'Next 2 weeks', date: short(addDays(todayIso, 7)), tasks: [{ title: 'Prepare a claim for each source', owner: 'Rights Agent' }, { title: 'Match unmatched statement lines', owner: 'Royalties Agent' }] },
        { name: 'Week 3', date: short(addDays(todayIso, 21)), tasks: [{ title: 'Claims filed after your approval', owner: 'Rights Agent' }] },
      ],
    };
  }

  if (g.kind === 'splits') {
    return {
      kind: g.kind, title: 'Set up splits', budget: null, budgetAssumed: false, dates: `${short(todayIso)} to ${short(addDays(todayIso, 14))}`, approvals: 1, assumptions,
      phases: [
        { name: 'This week', date: short(todayIso), tasks: [{ title: 'Draft a split from your deal template', owner: 'Legal Agent' }, { title: 'Check it totals exactly 100%', owner: 'Legal Agent' }] },
        { name: 'Next week', date: short(addDays(todayIso, 7)), tasks: [{ title: 'Send for signatures after your approval', owner: 'Legal Agent' }] },
        { name: 'Week 2', date: short(addDays(todayIso, 14)), tasks: [{ title: 'Signed split applied to payouts', owner: 'Royalties Agent' }] },
      ],
    };
  }

  if (g.kind === 'grants') {
    return {
      kind: g.kind, title: 'Find grants you qualify for', budget: null, budgetAssumed: false, dates: `${short(todayIso)} to ${short(addDays(todayIso, 28))}`, approvals: 1, assumptions,
      phases: [
        { name: 'This week', date: short(todayIso), tasks: [{ title: 'Check 41 funding sources against your profile', owner: 'Funding Scout' }] },
        { name: 'Next 2 weeks', date: short(addDays(todayIso, 7)), tasks: [{ title: 'Draft applications for the best fits', owner: 'Funding Scout' }] },
        { name: 'Week 4', date: short(addDays(todayIso, 28)), tasks: [{ title: 'Applications submitted after your approval', owner: 'Funding Scout' }] },
      ],
    };
  }

  assumptions.push('I’m not sure what this needs yet, so the first step is a few questions.');
  return {
    kind: g.kind, title: g.text.charAt(0).toUpperCase() + g.text.slice(1), budget: g.budget, budgetAssumed: false,
    dates: `${short(todayIso)} to ${short(addDays(todayIso, 14))}`, approvals: 1, assumptions,
    phases: [
      { name: 'This week', date: short(todayIso), tasks: [{ title: 'Ask you 3 questions to pin down the goal', owner: 'Label Head' }] },
      { name: 'Next week', date: short(addDays(todayIso, 7)), tasks: [{ title: 'Come back with a full plan, budget and dates', owner: 'Label Head' }] },
    ],
  };
}

