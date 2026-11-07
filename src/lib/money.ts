// Money is always integer cents. Convert at the data boundary with toCents().
import { integerToWords } from './words';

export type Cents = number;
export type Currency = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'AUD';

const MINUS = '−'; // U+2212, never a hyphen

/** Dollars (as the sample data stores them) to integer cents, rounding half away from zero. */
export function toCents(dollars: number): Cents {
  const c = Math.round(Math.abs(dollars) * 100 + 1e-9);
  return dollars < 0 ? -c : c;
}

export function assertCents(c: number): asserts c is Cents {
  if (!Number.isInteger(c)) throw new Error(`Money must be integer cents, got ${c}`);
}

const SYMBOL: Record<Currency, string> = { USD: '$', CAD: '$', GBP: '£', EUR: '€', AUD: '$' };

type FormatOptions = {
  currency?: Currency;
  /** Show "+" on positive amounts (for deltas). */
  signed?: boolean;
  /** Drop ".00" on whole amounts, for headline figures like "$3,000". */
  wholeIfRound?: boolean;
};

/**
 * "$1,240.18", "−$500.00". The currency code is shown only when it is not USD:
 * "CAD $1,200.00".
 */
export function formatMoney(cents: Cents, opts: FormatOptions = {}): string {
  assertCents(cents);
  const { currency = 'USD', signed = false, wholeIfRound = false } = opts;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = dollars.toLocaleString('en-US');
  const body = wholeIfRound && rem === 0 ? whole : `${whole}.${String(rem).padStart(2, '0')}`;
  const sign = cents < 0 ? MINUS : signed && cents > 0 ? '+' : '';
  const code = currency === 'USD' ? '' : `${currency} `;
  return `${code}${sign}${SYMBOL[currency]}${body}`;
}

const UNIT: Record<Currency, [string, string]> = {
  USD: ['dollar', 'dollars'], CAD: ['Canadian dollar', 'Canadian dollars'], AUD: ['Australian dollar', 'Australian dollars'],
  GBP: ['pound', 'pounds'], EUR: ['euro', 'euros'],
};
const SUB: Record<Currency, [string, string]> = {
  USD: ['cent', 'cents'], CAD: ['cent', 'cents'], AUD: ['cent', 'cents'], GBP: ['penny', 'pence'], EUR: ['cent', 'cents'],
};

/** Screen-reader words: 234675 -> "two thousand three hundred forty-six dollars and seventy-five cents". */
export function moneyToWords(cents: Cents, currency: Currency = 'USD'): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const [u1, uN] = UNIT[currency];
  const [s1, sN] = SUB[currency];
  const majorWords = `${integerToWords(major)} ${major === 1 ? u1 : uN}`;
  const words = minor ? `${majorWords} and ${integerToWords(minor)} ${minor === 1 ? s1 : sN}` : majorWords;
  return cents < 0 ? `minus ${words}` : words;
}
