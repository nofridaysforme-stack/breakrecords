// Agents, rules first: each one reads the label's own facts and says what it notices. What then
// happens follows the department's autonomy, never the rule itself:
//  * observe and suggest: the finding is recorded and shown; nothing else.
//  * draft and wait: a finding that comes with a card puts it in Approvals for a person.
//  * act within limits (only where the platform allows it): a small fix is made, and recorded.
// Filings, money and signatures are always cards. A run never reports the same thing twice: each
// finding has a stable key, stays open while the run still sees it, and closes when it's gone.
// Pure; the app's runner loads the facts and writes the result.

export type Autonomy = 'observe' | 'suggest' | 'draft_and_wait' | 'act_within_limits';
export type Dept = { slug: string; agent: string; autonomy: Autonomy | null; canAct: boolean };

/** What a rule noticed. `card` and `fix` are instructions the runner knows how to carry out. */
export type Finding = {
  dept: string; key: string; rule: string; title: string; detail: string; href: string;
  card?: { kind: string; args: Record<string, string> };
  fix?: { kind: string; args: Record<string, string | number> };
};
export type StoredFinding = { key: string; status: 'open' | 'resolved' | 'dismissed'; approvalId: string | null; fixed: boolean };

/** Most cards one department puts in Approvals in one run, so a first run doesn't bury the inbox. */
export const MAX_CARDS_PER_RUN = 8;

export type RunPlan = {
  /** New, or seen again after it was resolved. */
  open: Finding[];
  /** Still there: only its last sighting changes. */
  keep: string[];
  /** Open before, gone now. */
  close: string[];
  /** Findings whose card goes to Approvals now. */
  cards: Finding[];
  /** Findings the agent fixes itself now. */
  fixes: Finding[];
};

const drafts = (d: Dept | undefined) => d?.autonomy === 'draft_and_wait' || d?.autonomy === 'act_within_limits';
const acts = (d: Dept | undefined) => d?.autonomy === 'act_within_limits' && d.canAct;

/** What a run does with what it found, given what's already recorded and each department's autonomy. */
export function planRun(found: Finding[], stored: StoredFinding[], depts: Dept[]): RunPlan {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const dept = new Map(depts.map((d) => [d.slug, d]));
  const seen = new Set<string>();
  const plan: RunPlan = { open: [], keep: [], close: [], cards: [], fixes: [] };
  const cardsPer = new Map<string, number>();
  for (const f of found) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    const s = byKey.get(f.key);
    const d = dept.get(f.dept);
    if (!d || d.autonomy === null) continue; // a department that isn't active yet does nothing
    if (s?.status === 'dismissed') continue; // a person said no; it stays quiet
    if (!s || s.status === 'resolved') plan.open.push(f); else plan.keep.push(f.key);
    if (f.fix && acts(d) && !s?.fixed) { plan.fixes.push(f); continue; }
    if (f.card && drafts(d) && !s?.approvalId) {
      const n = cardsPer.get(f.dept) ?? 0;
      if (n < MAX_CARDS_PER_RUN) { plan.cards.push(f); cardsPer.set(f.dept, n + 1); }
    }
  }
  for (const s of stored) if (s.status === 'open' && !seen.has(s.key)) plan.close.push(s.key);
  return plan;
}

/** A department's state after a run: waiting on a person, still working on open findings, or done. */
export function deptState(open: number, waitingCards: number): 'waitingOnYou' | 'working' | 'done' {
  return waitingCards ? 'waitingOnYou' : open ? 'working' : 'done';
}

/** One line for the activity log about a department's run, or null when nothing changed. */
export function runSummary(agent: string, p: { opened: number; closed: number; cards: number; fixes: number }): string | null {
  const parts: string[] = [];
  if (p.opened) parts.push(`found ${p.opened} new ${p.opened === 1 ? 'thing' : 'things'} to look at`);
  if (p.cards) parts.push(`put ${p.cards} ${p.cards === 1 ? 'card' : 'cards'} in Approvals`);
  if (p.fixes) parts.push(`fixed ${p.fixes} on its own`);
  if (p.closed) parts.push(`saw ${p.closed} ${p.closed === 1 ? 'thing' : 'things'} resolved`);
  if (!parts.length) return null;
  const last = parts.pop()!;
  return `${agent} ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}
