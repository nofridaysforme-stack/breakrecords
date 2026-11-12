// Reserves in sample-data mode: the income each release earned by recording and month, the
// unpaid batch lines and where their money comes from, and the statements' releases. Same
// numbers as the seed, so a flag holds the same amounts on both.
import type { ReservesResponse } from '@breakrecords/contract';

/** release → period → recording title → cents. */
export const INCOME: Record<string, Record<string, Record<string, number>>> = {
  rel_nightbus: { '2026-09-01': { 'Night Bus': 50000 }, '2026-10-01': { 'Night Bus': 233228, 'Static Hymn': 0 } },
  rel_velvet: { '2026-09-01': { 'Paper Moons': 33870, 'Velvet Hours': 1126842 }, '2026-10-01': { 'Paper Moons': 44260, 'Velvet Hours': 1045000 } },
};
export const OPEN_LINES: { batch: string; period: string; release: string; amount: number }[] = [
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_velvet', amount: 26075 },
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_nightbus', amount: 21420 },
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_nightbus', amount: 5183 },
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_velvet', amount: 28500 },
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_nightbus', amount: 21420 },
  { batch: 'pb-2026-10', period: '2026-10-01', release: 'rel_nightbus', amount: 21420 },
  { batch: 'pb-2026-q3', period: '2026-10-01', release: 'rel_velvet', amount: 234675 },
  { batch: 'pb-2026-q3', period: '2026-10-01', release: 'rel_nightbus', amount: 455740 },
];
export const STATEMENT_SOURCE: Record<string, { release: string; period: string }> = {
  'ST-2026-10-KV': { release: 'rel_velvet', period: '2026-10-01' },
  'ST-2026-10-MD': { release: 'rel_velvet', period: '2026-10-01' },
  'ST-2026-10-AM': { release: 'rel_velvet', period: '2026-10-01' },
  'ST-2026-09-MD': { release: 'rel_velvet', period: '2026-09-01' },
};
/** Recordings and what each earned in months not yet paid out (October). */
export const FLAGGABLE: { id: string; title: string; unpaid: number }[] = [
  { id: 'glasshouse', title: 'Glasshouse', unpaid: 0 }, { id: 'low-light', title: 'Low Light', unpaid: 0 },
  { id: 'night-bus', title: 'Night Bus', unpaid: 233228 }, { id: 'night-bus-demo', title: 'Night Bus (demo)', unpaid: 0 }, { id: 'paper-moons', title: 'Paper Moons', unpaid: 44260 },
  { id: 'static-hymn', title: 'Static Hymn', unpaid: 0 }, { id: 'velvet-hours', title: 'Velvet Hours', unpaid: 1045000 },
];
/** The Audit Agent's Night Bus flag, resolved before the platform: a playlist add, real listeners. */
export const PAST_RESERVES: ReservesResponse['items'] = [
  { id: 'rsv-night-bus-oct', recording: 'Night Bus', recordingId: 'night-bus', note: 'unusual stream spike on Oct 28', opened: 'Nov 6', amount: 109928, heldNow: 0,
    status: 'released', outcomeNote: 'Distributor report: a playlist add, real listeners' },
];
