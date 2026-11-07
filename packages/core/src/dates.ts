// Calendar-day math on UTC dates, so a release date never shifts across time zones.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

export const parseIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(new Date(parseIso(iso).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY);

/** "2027-01-08" -> "Jan 8". */
export const short = (iso: string) => { const d = parseIso(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
/** "2027-03-05" -> "Fri, Mar 5, 2027". */
export const long = (iso: string) => parseIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
