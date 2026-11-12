/** A four-digit tax year from a URL, or null. */
export const yearOf = (raw: string) => (/^\d{4}$/.test(raw) && Number(raw) >= 2000 && Number(raw) <= 2100 ? Number(raw) : null);
