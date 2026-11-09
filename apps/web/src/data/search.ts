// What the ⌘K command bar searches: pages, catalog, people, money, approvals and contracts
// (flows.md > Navigation). Built from the same fixtures the screens use.
import { approvals } from './sample';
import { statements, payees, recoupment } from './money';
import { recordings, songs, catalogReleases, contracts, roster, funding, templates } from './ops';
import { primaryNav, footerNav } from '@/components/shell/nav';
import { formatMoney } from '@breakrecords/core/money';

export type SearchGroup = 'Go to' | 'Approvals' | 'Catalog' | 'People' | 'Money' | 'Contracts' | 'Funding';
export type SearchItem = { id: string; group: SearchGroup; label: string; hint: string; href: string; keywords?: string };

const pages: SearchItem[] = [
  ...[...primaryNav, ...footerNav].filter((n) => !n.locked).map((n) => ({ id: `nav-${n.label}`, group: 'Go to' as const, label: n.label, hint: 'Page', href: n.href })),
  ...[['Statements', '/money/statements'], ['Payouts', '/money/payouts'], ['Recoupment', '/money/recoupment'], ['Budgets', '/money/budgets'],
    ['Registrations', '/rights/registrations'], ['Unclaimed money', '/rights/unclaimed'], ['Profile claims', '/rights/claims'], ['Documents', '/rights/documents'],
    ['Compare offers', '/funding/offers/compare'], ['Integrations', '/settings/integrations'], ['White label theme', '/settings/white-label'],
    ['Approval routing', '/settings/routing'], ['Display density', '/settings/profile'], ['Payee portal', '/portal']]
    .map(([label, href]) => ({ id: `page-${href}`, group: 'Go to' as const, label, hint: 'Page', href })),
];

/** What the index is built from: the same shapes the screens read, from the mock or the live server. */
export type SearchSource = {
  approvals: { id: string; title: string; agent: string; due: string; impact: string }[];
  recordings: { id: string; title: string; artist: string; isrc: string | null; credits: { name: string; role: string }[] }[];
  songs: { id: string; title: string; writers: string; iswc: string | null }[];
  releases: { id: string; title: string; kind: string; artist: string; upc: string | null; href?: string }[];
  roster: { name: string; type: string }[];
  payees: { id: string; name: string }[];
  statements: { id: string; payee: string; period: string; net: number; release: string }[];
  batch: { label: string; hint: string } | null;
  recoupment: { id: string; title: string; artist: string }[];
  unclaimed: number;
  contracts: { id: string; name: string; parties: string; sig: string; terms: string; href?: string }[];
  templates: { id: string; name: string; version: string }[];
  funding: { id: string; title: string; type: string; amount: string; primary: { href: string } }[];
};

/** Builds the ⌘K index. Pages are always there; everything else comes from the source. */
export function buildIndex(src: SearchSource): SearchItem[] {
  const people = new Map<string, SearchItem>();
  const person = (name: string, hint: string, href: string) => { if (!people.has(name)) people.set(name, { id: `p-${name}`, group: 'People', label: name, hint, href }); };
  src.roster.forEach((a) => person(a.name, a.type, '/roster'));
  src.recordings.forEach((r) => r.credits.forEach((c) => person(c.name, c.role, `/catalog/recordings?id=${r.id}`)));
  src.payees.forEach((p) => person(p.name, 'Payee', `/portal?as=${p.id}`));
  return [
    ...pages,
    ...src.approvals.map((a) => ({ id: `a-${a.id}`, group: 'Approvals' as const, label: a.title, hint: `${a.agent} · due ${a.due}`, href: `/approvals/${a.id}`, keywords: a.impact })),
    ...src.recordings.map((r) => ({ id: `r-${r.id}`, group: 'Catalog' as const, label: r.title, hint: `Recording · ${r.artist}`, href: `/catalog/recordings?id=${r.id}`, keywords: r.isrc ?? '' })),
    ...src.songs.map((x) => ({ id: `s-${x.id}`, group: 'Catalog' as const, label: `${x.title} (song)`, hint: x.writers, href: '/catalog/songs', keywords: x.iswc ?? '' })),
    ...src.releases.map((r) => ({ id: `rel-${r.id}`, group: 'Catalog' as const, label: r.title, hint: `${r.kind} · ${r.artist}`, href: r.href ?? '/catalog/releases', keywords: r.upc ?? '' })),
    ...[...people.values()],
    ...src.statements.map((st) => ({ id: `st-${st.id}`, group: 'Money' as const, label: `Statement ${st.id}`, hint: `${st.payee} · ${st.period} · ${formatMoney(st.net)}`, href: `/money/statements/${st.id}`, keywords: st.release })),
    ...(src.batch ? [{ id: 'm-payout', group: 'Money' as const, label: src.batch.label, hint: src.batch.hint, href: '/money/payouts', keywords: 'payout pay batch' }] : []),
    ...src.recoupment.map((r) => ({ id: `rc-${r.id}`, group: 'Money' as const, label: `${r.title} recoupment`, hint: r.artist, href: '/money/recoupment' })),
    ...(src.unclaimed ? [{ id: 'm-unclaimed', group: 'Money' as const, label: 'Unclaimed royalties', hint: `${formatMoney(src.unclaimed)} found`, href: '/rights/unclaimed', keywords: 'owed soundexchange mlc' }] : []),
    ...src.contracts.map((c) => ({ id: `c-${c.id}`, group: 'Contracts' as const, label: c.name, hint: `${c.parties} · ${c.sig}`, href: c.href ?? '/contracts', keywords: c.terms })),
    ...src.templates.map((t) => ({ id: `t-${t.id}`, group: 'Contracts' as const, label: `${t.name} template`, hint: t.version, href: `/contracts/templates/${t.id}` })),
    ...src.funding.map((f) => ({ id: `f-${f.id}`, group: 'Funding' as const, label: f.title, hint: `${f.type} · ${f.amount}`, href: f.primary.href })),
  ];
}

/** The sample world's index, used by the mock and for instant results while the server answers. */
export const SEARCH_INDEX: SearchItem[] = buildIndex({
  approvals, recordings, songs, releases: catalogReleases, roster: [...roster, ...['Dana Okafor', 'Theo Lind', 'Rue Sato'].map((name) => ({ name, type: 'The Low Hours' }))],
  payees: Object.values(payees), statements: Object.values(statements), batch: { label: 'October payout batch', hint: '$1,240.18 to 6 payees' },
  recoupment, unclaimed: 31240, contracts, templates, funding,
});

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every word of the query must appear somewhere; title matches rank first. */
export function search(q: string, limit = 12, index: SearchItem[] = SEARCH_INDEX): SearchItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
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
