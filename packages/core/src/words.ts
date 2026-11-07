// Numbers to English words, for screen-reader labels on money and percentages.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ''));
  }
  return parts.join(' ');
}

/** Whole non-negative integer to words: 2346 -> "two thousand three hundred forty-six". */
export function integerToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`integerToWords needs a non-negative integer, got ${n}`);
  if (n === 0) return 'zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(underThousand(chunk) + (SCALES[scale] ? ` ${SCALES[scale]}` : ''));
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

/** Each digit spoken: "65" -> "six five". */
export function digitsToWords(digits: string): string {
  return digits.split('').map((d) => ONES[Number(d)]).join(' ');
}
