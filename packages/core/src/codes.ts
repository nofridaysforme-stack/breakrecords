// Recording and product codes. Pure; the database enforces the same shapes.
//
// ISRC: a 12-character code for one recording: country (2 letters), the owner's registrant
// code (3 letters or digits), year (2 digits), designation (5 digits), written with hyphens as
// US-NL1-26-00014. An owner with a Rights Owner Prefix (country + registrant code) numbers
// their own recordings, starting again at 00001 each year.
//
// UPC: a 12-digit barcode number for one product (a release): the owner's GS1 company prefix,
// an item reference, and a check digit. 13-digit EANs are also accepted when entered by hand.

/** "us-nl1-26-00014" or "USNL12600014" -> "USNL12600014". */
export const normalizeIsrc = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
export const isIsrc = (s: string) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s);
/** "USNL12600014" -> "US-NL1-26-00014". */
export const formatIsrc = (s: string) => (isIsrc(s) ? `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5, 7)}-${s.slice(7)}` : s);

/** A Rights Owner Prefix: country code and registrant code, e.g. "US-NL1" or "USNL1". */
export const normalizeIsrcPrefix = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
export const isIsrcPrefix = (s: string) => /^[A-Z]{2}[A-Z0-9]{3}$/.test(s);

/** The ISRC for designation number `n` (1 to 99999) in year `year` (four digits). */
export function isrcFor(prefix: string, year: number, n: number): string {
  if (!isIsrcPrefix(prefix)) throw new Error('Not an ISRC prefix');
  if (!Number.isInteger(n) || n < 1 || n > 99999) throw new Error('A year has designation numbers 00001 to 99999');
  return `${prefix}${String(year % 100).padStart(2, '0')}${String(n).padStart(5, '0')}`;
}

/** The GS1 check digit for the digits before it (works for 11-digit UPC and 12-digit EAN bodies). */
export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error('Digits only');
  let sum = 0;
  // From the right, the digit next to the check digit is weighted 3, then 1, then 3...
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export const normalizeUpc = (s: string) => s.replace(/[\s-]/g, '');
/** A 12-digit UPC or 13-digit EAN whose check digit is right. */
export const isUpc = (s: string) => /^\d{12,13}$/.test(s) && gtinCheckDigit(s.slice(0, -1)) === Number(s.at(-1));

/** A U.P.C. company prefix from GS1: 6 to 10 digits. */
export const isGs1Prefix = (s: string) => /^\d{6,10}$/.test(s);
/** How many products a prefix can number (item references 1 to this). */
export const gs1Capacity = (prefix: string) => 10 ** (11 - prefix.length) - 1;

/** The UPC for item reference `n` under a GS1 company prefix. */
export function upcFor(prefix: string, n: number): string {
  if (!isGs1Prefix(prefix)) throw new Error('Not a GS1 company prefix');
  if (!Number.isInteger(n) || n < 1 || n > gs1Capacity(prefix)) throw new Error('That prefix has no numbers left');
  const body = prefix + String(n).padStart(11 - prefix.length, '0');
  return body + gtinCheckDigit(body);
}
