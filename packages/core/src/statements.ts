// Statement rules shared by the mock and the live server: matching income lines to the
// catalog, the period notes on Royalties (4b), and the check every issued statement passes.
import type { Cents } from './money';
import { runWaterfall, type WaterfallRow } from './waterfall';

/** Edit distance between two short codes (insertions, deletions, substitutions). */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

export type CatalogIsrc = { id: string; title: string; isrc: string | null };
export type IsrcSuggestion = { recordingId: string; recording: string; recordingIsrc: string; reason: string };

/**
 * A reported ISRC the catalog doesn't have is suggested as a typo of a recording only when
 * exactly one catalog ISRC is one keystroke away. Anything less certain stays unknown.
 * The suggestion is never applied on its own; a person matches the lines.
 */
export function suggestIsrcMatch(raw: string, catalog: CatalogIsrc[]): IsrcSuggestion | null {
  const code = raw.trim().toUpperCase();
  if (catalog.some((r) => r.isrc === code)) return null;
  const near = catalog.filter((r) => r.isrc && editDistance(code, r.isrc) === 1);
  if (near.length !== 1) return null;
  const r = near[0];
  const isrc = r.isrc!;
  let i = 0;
  while (i < code.length && code[i] === isrc[i]) i++;
  const kind = (ch: string | undefined) => (ch && /\d/.test(ch) ? 'digit' : 'character');
  const how = code.length < isrc.length ? `one ${kind(isrc[i])} short of`
    : code.length > isrc.length ? `one ${kind(code[i])} longer than` : `one ${kind(isrc[i])} off from`;
  return { recordingId: r.id, recording: r.title, recordingIsrc: isrc, reason: `${how} ${r.title} (${isrc})` };
}

/** The note under unmatched lines on 4b. */
export function unmatchedNote(suggestions: { count: number; recording: string }[], unknown: number): string {
  if (suggestions.length) {
    const top = [...suggestions].sort((a, b) => b.count - a.count)[0];
    return `Royalties Agent thinks ${top.count} are a typo in "${top.recording}" metadata.`;
  }
  return unknown ? 'Royalties Agent is asking the sources about them.' : 'Every line is matched.';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-01" (or a Date) to "October 2026". Periods are calendar months in UTC. */
export function periodLabel(period: string | Date): string {
  const d = typeof period === 'string' ? new Date(`${period.slice(0, 10)}T00:00:00Z`) : period;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Up 18% on September". Rounded to the whole percent; no previous period says so. */
export function changeNote(current: Cents, previous: Cents | null, previousPeriod: string | Date | null): string {
  if (previous === null || previousPeriod === null || previous <= 0) return 'First period on record';
  const month = periodLabel(previousPeriod).split(' ')[0];
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `Level with ${month}`;
  return `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% on ${month}`;
}

export type StatementProblem = 'empty' | 'not_cents' | 'bad_balance' | 'net_mismatch' | 'no_start';

/**
 * An issued statement must hold together: integer cents, a start row first, every balance
 * equal to the running total, and the net equal to the last balance. Served statements are
 * checked; a statement that fails is a bug, not something to show a payee.
 */
export function checkStatement(rows: WaterfallRow[], net: Cents): StatementProblem | null {
  if (!rows.length) return 'empty';
  if (rows[0].kind !== 'start') return 'no_start';
  for (const r of rows) {
    if (!Number.isInteger(r.balance) || ('amount' in r && !Number.isInteger(r.amount))) return 'not_cents';
  }
  const again = runWaterfall(rows.map(({ balance: _b, ...step }) => step));
  if (again.some((r, i) => r.balance !== rows[i].balance)) return 'bad_balance';
  if (rows[rows.length - 1].balance !== net) return 'net_mismatch';
  return null;
}
