/** Portal links keep `?as=` so the label can preview a payee's portal (mock: any payee). */
export const DEFAULT_PAYEE = 'marco-dela';
export const withAs = (href: string, id: string) => (id === DEFAULT_PAYEE ? href : `${href}${href.includes('?') ? '&' : '?'}as=${id}`);
