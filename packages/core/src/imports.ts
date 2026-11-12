// Statement imports: a distributor's or society's export (CSV or tab-separated) read into
// income lines, one statement per month. Pure: the server stores what this returns.
//
// Money. Exports report fractions of a cent per line (0.00412). Each amount is read exactly,
// as millionths of a dollar, never as a float. A month's total is rounded to the cent once,
// and the cents are shared out to its lines by largest remainder, so the lines add up to the
// total exactly and no fraction of a cent is dropped.

export type ImportField = 'title' | 'isrc' | 'artist' | 'store' | 'territory' | 'units' | 'amount' | 'period';
export type Mapping = Partial<Record<ImportField, string>>;
export type Provider = { id: string; name: string; source: 'distributor' | 'soundexchange' | 'mlc' | 'pro'; prefix: string };

/** Where statements come from. Column names differ by export; the mapping is guessed, then checked by a person. */
export const PROVIDERS: Provider[] = [
  { id: 'distrokid', name: 'DistroKid', source: 'distributor', prefix: 'DK' },
  { id: 'tunecore', name: 'TuneCore', source: 'distributor', prefix: 'TC' },
  { id: 'cdbaby', name: 'CD Baby', source: 'distributor', prefix: 'CDB' },
  { id: 'unitedmasters', name: 'UnitedMasters', source: 'distributor', prefix: 'UM' },
  { id: 'awal', name: 'AWAL', source: 'distributor', prefix: 'AWAL' },
  { id: 'believe', name: 'Believe', source: 'distributor', prefix: 'BLV' },
  { id: 'soundexchange', name: 'SoundExchange', source: 'soundexchange', prefix: 'SX' },
  { id: 'mlc', name: 'The MLC', source: 'mlc', prefix: 'MLC' },
  { id: 'other', name: 'Another distributor', source: 'distributor', prefix: 'IMP' },
];

/** Header names each field goes by in common exports, most specific first. Matched ignoring case and punctuation. */
const SYNONYMS: Record<ImportField, string[]> = {
  amount: ['earnings usd', 'earnings', 'total earned', 'net revenue', 'net amount', 'royalty amount', 'royalty', 'amount payable', 'payable', 'net', 'revenue', 'amount', 'total'],
  period: ['sale month', 'sales month', 'sales period', 'reporting period', 'usage period', 'statement period', 'period', 'month', 'sale date', 'sales date', 'transaction date', 'date'],
  isrc: ['isrc'],
  title: ['song title', 'track title', 'title', 'track', 'song', 'track name', 'song name', 'recording title', 'work title'],
  artist: ['artist name', 'artist', 'performer'],
  store: ['store name', 'store', 'service', 'dsp', 'partner', 'platform', 'retailer', 'source', 'channel'],
  territory: ['country of sale', 'country code', 'country', 'territory', 'market'],
  units: ['units sold', 'quantity', 'units', 'streams', 'plays', 'count', 'performances'],
};
export const REQUIRED: ImportField[] = ['title', 'amount', 'period'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- reading the file ----------

/** Rows of a CSV or tab-separated file, quotes and all. The delimiter is whichever the header line uses most. */
export function parseDelimited(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const counts = { ',': (firstLine.match(/,/g) ?? []).length, '\t': (firstLine.match(/\t/g) ?? []).length, ';': (firstLine.match(/;/g) ?? []).length };
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as ',' | '\t' | ';';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** The likely column for each field, from the header names. Each column is used once. */
export function guessMapping(headers: string[]): Mapping {
  const taken = new Set<string>();
  const out: Mapping = {};
  for (const field of ['isrc', 'amount', 'period', 'units', 'territory', 'store', 'artist', 'title'] as ImportField[]) {
    for (const syn of SYNONYMS[field]) {
      const hit = headers.find((h) => !taken.has(h) && norm(h) === syn) ?? headers.find((h) => !taken.has(h) && norm(h).includes(syn) && !(field === 'title' && /artist|album|release/i.test(h)));
      if (hit) { out[field] = hit; taken.add(hit); break; }
    }
  }
  return out;
}

// ---------- values ----------

/** An amount in millionths of a dollar: "1,234.5", "$0.00412", "(3.10)" and "-3.10" are all read exactly. Null if it isn't a number. */
export function parseMicros(raw: string): number | null {
  let s = raw.trim().replace(/[$€£\s]/g, '').replace(/^USD/i, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  // "1.234,56" (comma decimals) when the last separator is a comma followed by 1 or 2 digits.
  if (/,\d{1,2}$/.test(s) && !/\.\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/,/g, '');
  const m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m || (m[1] === '' && !m[2])) return null;
  let whole = m[1] || '0'; let frac = m[2] ?? '';
  const exp = m[3] ? Number(m[3]) : 0;
  if (exp > 0) { whole += frac.slice(0, exp).padEnd(exp, '0'); frac = frac.slice(exp); }
  else if (exp < 0) { const all = whole.padStart(-exp + 1, '0'); whole = all.slice(0, exp) || '0'; frac = all.slice(exp) + frac; }
  // Round to the millionth, half up.
  const sixth = frac.padEnd(7, '0');
  let micros = Number(whole) * 1_000_000 + Number(sixth.slice(0, 6));
  if (Number(sixth[6]) >= 5) micros += 1;
  return neg ? -micros : micros;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** The first of the month a value names: "2026-10", "2026-10-15", "10/2026", "10/15/2026", "Oct 2026", "October 2026", "2026/10", "202610". */
export function parsePeriod(raw: string): string | null {
  const s = raw.trim();
  const ok = (y: number, m: number) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}-01` : null);
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[T ].*)?$/.exec(s); if (m) return ok(+m[1], +m[2]);
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s); if (m) return ok(+m[2], +m[1]);
  m = /^(\d{1,2})[-/.]\d{1,2}[-/.](\d{4})$/.exec(s); if (m) return ok(+m[2], +m[1]);
  m = /^(\d{4})(\d{2})$/.exec(s); if (m) return ok(+m[1], +m[2]);
  m = /^([a-z]{3,9})[\s,-]+(\d{4})$/i.exec(s); if (m) { const i = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); return i >= 0 ? ok(+m[2], i + 1) : null; }
  m = /^(\d{4})[\s,-]+([a-z]{3,9})$/i.exec(s); if (m) { const i = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return i >= 0 ? ok(+m[1], i + 1) : null; }
  return null;
}

const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const normIsrc = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

/**
 * Shares a total's cents out to lines by largest remainder: each line gets its exact amount
 * rounded down, and the leftover cents go to the lines with the largest fractions, in line order.
 */
export function allocateCents(micros: number[]): { cents: number[]; totalCents: number } {
  const total = micros.reduce((a, b) => a + b, 0);
  const totalCents = Math.round(total / 10_000); // half away from zero is fine: one rounding, at the total
  const floors = micros.map((m) => Math.floor(m / 10_000));
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = micros.map((m, i) => ({ i, frac: m - floors[i] * 10_000 })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const cents = [...floors];
  for (let k = 0; left > 0 && k < order.length; k++, left--) cents[order[k % order.length].i] += 1;
  for (let k = order.length - 1; left < 0 && k >= 0; k--, left++) cents[order[k].i] -= 1;
  return { cents, totalCents };
}

// ---------- the whole file ----------

export type ImportLine = { lineNo: number; title: string; isrc: string | null; store: string | null; territory: string | null; units: number | null; amountCents: number; matched: boolean };
export type ImportMonth = { period: string; lines: ImportLine[]; totalCents: number; matched: number; unmatched: number; unmatchedCents: number };
export type ImportResult = { headers: string[]; rows: number; months: ImportMonth[]; problems: { row: number; problem: string }[]; missing: ImportField[] };

/**
 * Reads a file with a column mapping. Rows with no amount, an unreadable amount or month, or no
 * title are listed as problems and left out; nothing is guessed. `known` is the catalog's ISRCs.
 */
export function readStatement(text: string, mapping: Mapping, known: Set<string>): ImportResult {
  const [headers = [], ...data] = parseDelimited(text);
  const missing = REQUIRED.filter((f) => !mapping[f] || !headers.includes(mapping[f]!));
  if (missing.length) return { headers, rows: data.length, months: [], problems: [], missing };
  const col = (f: ImportField) => (mapping[f] ? headers.indexOf(mapping[f]!) : -1);
  const at = (r: string[], f: ImportField) => { const i = col(f); return i >= 0 ? (r[i] ?? '').trim() : ''; };
  const problems: ImportResult['problems'] = [];
  const byMonth = new Map<string, { row: string[]; micros: number; rowNo: number }[]>();
  data.forEach((r, i) => {
    const rowNo = i + 2; // the header is row 1
    const micros = parseMicros(at(r, 'amount'));
    const period = parsePeriod(at(r, 'period'));
    const title = at(r, 'title');
    if (micros === null) return problems.push({ row: rowNo, problem: at(r, 'amount') ? `“${at(r, 'amount')}” isn’t an amount` : 'No amount' });
    if (!period) return problems.push({ row: rowNo, problem: at(r, 'period') ? `“${at(r, 'period')}” isn’t a month` : 'No month' });
    if (!title) return problems.push({ row: rowNo, problem: 'No title' });
    const list = byMonth.get(period) ?? [];
    list.push({ row: r, micros, rowNo });
    byMonth.set(period, list);
  });
  const months: ImportMonth[] = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, rows]) => {
    const { cents, totalCents } = allocateCents(rows.map((x) => x.micros));
    const lines: ImportLine[] = rows.map((x, k) => {
      const isrc = at(x.row, 'isrc') ? normIsrc(at(x.row, 'isrc')) : null;
      const terr = at(x.row, 'territory').toUpperCase();
      const units = at(x.row, 'units') ? Number(at(x.row, 'units').replace(/[,\s]/g, '')) : null;
      return {
        lineNo: k + 1, title: at(x.row, 'title').slice(0, 300), isrc: isrc && isrc.length <= 20 ? isrc : null,
        store: at(x.row, 'store').slice(0, 120) || null, territory: /^[A-Z]{2}$/.test(terr) ? terr : null,
        units: units !== null && Number.isInteger(units) && units >= 0 ? units : null,
        amountCents: cents[k], matched: !!isrc && ISRC.test(isrc) && known.has(isrc),
      };
    });
    const unmatched = lines.filter((l) => !l.matched);
    return { period, lines, totalCents, matched: lines.length - unmatched.length, unmatched: unmatched.length, unmatchedCents: unmatched.reduce((a, l) => a + l.amountCents, 0) };
  });
  return { headers, rows: data.length, months, problems, missing: [] };
}

/** A statement reference for an imported month: provider, year, month and a short code ("DK-2026-10-4F2A"). */
export const importRef = (prefix: string, period: string, code: string) => `${prefix}-${period.slice(0, 4)}-${period.slice(5, 7)}-${code.toUpperCase()}`;
