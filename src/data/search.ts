// What the ⌘K command bar searches: pages, catalog, people, money, approvals and contracts
// (flows.md > Navigation). Built from the same fixtures the screens use.
import { approvals } from './sample';
import { statements, payees, recoupment } from './money';
import { recordings, songs, catalogReleases, contracts, roster, funding, templates } from './ops';
import { primaryNav, footerNav } from '@/components/shell/nav';
import { formatMoney } from '@/lib/money';

export type SearchGroup = 'Go to' | 'Approvals' | 'Catalog' | 'People' | 'Money' | 'Contracts' | 'Funding';
export type SearchItem = { id: string; group: SearchGroup; label: string; hint: string; href: string; keywords?: string };

const pages: SearchItem[] = [
  ...[...primaryNav, ...footerNav].filter((n) => !n.locked).map((n) => ({ id: `nav-${n.label}`, group: 'Go to' as const, label: n.label, hint: 'Page', href: n.href })),
  ...[['Statements', '/money/statements'], ['Payouts', '/money/payouts'], ['Recoupment', '/money/recoupment'], ['Budgets', '/money/budgets'],
    ['Registrations', '/rights/registrations'], ['Unclaimed money', '/rights/unclaimed'], ['Profile claims', '/rights/claims'],
    ['Compare offers', '/funding/offers/compare'], ['Integrations', '/settings/integrations'], ['White label theme', '/settings/white-label'],
    ['Approval routing', '/settings/routing'], ['Display density', '/settings/profile'], ['Payee portal', '/portal']]
    .map(([label, href]) => ({ id: `page-${href}`, group: 'Go to' as const, label, hint: 'Page', href })),
];

const people = new Map<string, SearchItem>();
const person = (name: string, hint: string, href: string) => { if (!people.has(name)) people.set(name, { id: `p-${name}`, group: 'People', label: name, hint, href }); };
roster.forEach((a) => person(a.name, a.type, '/roster'));
['Dana Okafor', 'Theo Lind', 'Rue Sato'].forEach((n) => person(n, 'The Low Hours', '/roster'));
recordings.flatMap((r) => r.credits).forEach((c) => person(c.name, c.role, `/catalog/recordings?id=${recordings.find((r) => r.credits.includes(c))!.id}`));
Object.values(payees).forEach((p) => person(p.name, 'Payee', `/portal?as=${p.id}`));

export const SEARCH_INDEX: SearchItem[] = [
  ...pages,
  ...approvals.map((a) => ({ id: `a-${a.id}`, group: 'Approvals' as const, label: a.title, hint: `${a.agent} · due ${a.due}`, href: `/approvals/${a.id}`, keywords: a.impact })),
  ...recordings.map((r) => ({ id: `r-${r.id}`, group: 'Catalog' as const, label: r.title, hint: `Recording · ${r.artist}`, href: `/catalog/recordings?id=${r.id}`, keywords: r.isrc ?? '' })),
  ...songs.map((s) => ({ id: `s-${s.id}`, group: 'Catalog' as const, label: `${s.title} (song)`, hint: s.writers, href: '/catalog/songs', keywords: s.iswc ?? '' })),
  ...catalogReleases.map((r) => ({ id: `rel-${r.id}`, group: 'Catalog' as const, label: r.title, hint: `${r.kind} · ${r.artist}`, href: r.href ?? '/catalog/releases', keywords: r.upc })),
  ...[...people.values()],
  ...Object.values(statements).map((st) => ({ id: `st-${st.id}`, group: 'Money' as const, label: `Statement ${st.id}`, hint: `${st.payee} · ${st.period} · ${formatMoney(st.net)}`, href: `/money/statements/${st.id}`, keywords: st.release })),
  { id: 'm-payout', group: 'Money', label: 'October payout batch', hint: '$1,240.18 to 6 payees', href: '/money/payouts', keywords: 'payout pay batch' },
  ...recoupment.map((r) => ({ id: `rc-${r.id}`, group: 'Money' as const, label: `${r.title} recoupment`, hint: r.artist, href: '/money/recoupment' })),
  { id: 'm-unclaimed', group: 'Money', label: 'Unclaimed royalties', hint: '$312.40 found', href: '/rights/unclaimed', keywords: 'owed soundexchange mlc' },
  ...contracts.map((c) => ({ id: `c-${c.id}`, group: 'Contracts' as const, label: c.name, hint: `${c.parties} · ${c.sig}`, href: c.href ?? '/contracts', keywords: c.terms })),
  ...templates.map((t) => ({ id: `t-${t.id}`, group: 'Contracts' as const, label: `${t.name} template`, hint: t.version, href: `/contracts/templates/${t.id}` })),
  ...funding.map((f) => ({ id: `f-${f.id}`, group: 'Funding' as const, label: f.title, hint: `${f.type} · ${f.amount}`, href: f.primary.href })),
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every word of the query must appear somewhere; title matches rank first. */
export function search(q: string, limit = 12): SearchItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SEARCH_INDEX
    .map((item) => {
      const title = norm(item.label); const all = `${title} ${norm(item.hint)} ${norm(item.keywords ?? '')} ${norm(item.group)}`;
      if (!words.every((w) => all.includes(w))) return null;
      const score = (title.startsWith(words[0]) ? 0 : words.every((w) => title.includes(w)) ? 1 : 2) + (item.group === 'Go to' ? 0.5 : 0);
      return { item, score };
    })
    .filter((x): x is { item: SearchItem; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.item);
}
