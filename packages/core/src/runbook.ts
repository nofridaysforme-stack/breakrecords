// Release runbook rules (2g), shared by the mock and the live server. A phase is on a fixed
// date or a number of days from the release date; its status and the release's come from
// the tasks and today's date, never stored.
import { addDays } from './dates';

export type TaskState = 'done' | 'inProgress' | 'needsYou' | 'waiting' | 'locked';
export type PhaseInput = { startsOn: string | null; offsetDays: number | null; tasks: { state: TaskState }[] };
export type PhaseStatus = 'done' | 'now' | 'future';
export type ReleaseStatus = 'onTrack' | 'atRisk' | 'blocked';

/** The phase's date: its own, or the release date plus its offset. */
export function phaseDate(releaseIso: string, p: Pick<PhaseInput, 'startsOn' | 'offsetDays'>): string {
  if (p.startsOn) return p.startsOn;
  if (p.offsetDays === null) throw new Error('A phase needs a date or an offset from the release date.');
  return addDays(releaseIso, p.offsetDays);
}

/** Done when every task is; now once its date has come; otherwise still ahead. */
export function phaseStatus(phaseIso: string, tasks: { state: TaskState }[], todayIso: string): PhaseStatus {
  if (tasks.length && tasks.every((t) => t.state === 'done')) return 'done';
  return phaseIso <= todayIso ? 'now' : 'future';
}

/** How long a "needs you" task can sit in a started phase before the release is at risk. */
export const NEEDS_YOU_GRACE_DAYS = 14;

/**
 * Blocked: a gate is still locked after its phase has started. At risk: spending is over
 * budget, or something has waited on a person for more than two weeks. Otherwise on track.
 */
export function releaseStatus(phases: { iso: string; tasks: { state: TaskState }[] }[], spent: number, budget: number, todayIso: string): ReleaseStatus {
  const started = phases.filter((p) => p.iso <= todayIso);
  if (started.some((p) => p.tasks.some((t) => t.state === 'locked'))) return 'blocked';
  if (spent > budget) return 'atRisk';
  const stale = addDays(todayIso, -NEEDS_YOU_GRACE_DAYS);
  if (started.some((p) => p.iso < stale && p.tasks.some((t) => t.state === 'needsYou'))) return 'atRisk';
  return 'onTrack';
}

/** What stands between the release and delivery: unfinished tasks that say why, in runbook order. */
export function deliveryBlockers(tasks: { state: TaskState; blocksDelivery: string | null }[]): string[] {
  return tasks.filter((t) => t.state !== 'done' && t.blocksDelivery).map((t) => t.blocksDelivery!);
}

/**
 * Runbook tasks follow the catalog (rule MET-02): a code task is done the moment the codes
 * exist, whoever added them, so the runbook never asks for something already there.
 */
export function syncTaskState(title: string, state: TaskState, catalog: { codesAssigned: boolean }): TaskState {
  if (/\bISRC\b.*\bUPC\b|\bUPC\b.*\bISRC\b/i.test(title) && catalog.codesAssigned) return 'done';
  return state;
}
