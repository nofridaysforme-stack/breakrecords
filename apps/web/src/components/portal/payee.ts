import { payees } from '@/data/money';

const getPayee = (id: string) => payees[id as keyof typeof payees] ?? null;

/** The signed-in payee. The mock has no login, so `?as=` picks one; Marco Dela by default. */
export function resolvePayee(as?: string) {
  return getPayee(as ?? 'marco') ?? getPayee('marco')!;
}
export const withAs = (href: string, id: string) => (id === 'marco' ? href : `${href}${href.includes('?') ? '&' : '?'}as=${id}`);
