// People and companies in a workspace: the facts the rights forms need about each one, and
// which of them are still missing. Pure; the forms themselves say why each one matters.

import type { Person } from './documents';

export const COUNTRY = /^[A-Z]{2}$/;
/** An IPI (CAE) name number: 9 to 11 digits. */
export const IPI = /^\d{9,11}$/;

/** What isn't on file for someone, in the words the edit page uses. A group's members carry their own legal facts. */
export function personMissing(p: Person): string[] {
  const out: string[] = [];
  if (p.type !== 'group') {
    if (!p.legalName) out.push('Legal name');
    if (!p.pro) out.push('PRO');
    if (!p.ipi && p.pro !== 'none') out.push('IPI');
  }
  if (!p.email) out.push('Email');
  if (!p.phone) out.push('Phone');
  if (!p.address) out.push('Address');
  if (p.type !== 'group' && !p.citizenship && !p.domicile) out.push('Citizenship or home country');
  return out;
}

/** "3:45" or "225" to seconds; null when it can't be read. */
export function parseLength(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  const n = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d{1,5}$/.test(t) ? Number(t) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 86400 ? n : null;
}

/** Common credit roles, offered first; any other words are kept as typed. */
export const CREDIT_ROLES = ['Producer', 'Co-producer', 'Mix engineer', 'Mastering engineer', 'Recording engineer', 'Featured artist', 'Performer', 'Songwriter'];
