// Sample rights details for the Northline catalog: the facts prepared documents need (legal
// names, PROs, IPIs, writer roles, publishers, master owner). Shared by the seed (live mode) and
// the mock. Every person and number here is invented. Some facts are left out on purpose, so
// the documents show what a real catalog's gaps look like: Marco Dela has no PRO or IPI yet,
// Rue Sato has no IPI, and Glasshouse has no publisher for Marco's share.

export type SamplePro = 'ascap' | 'bmi' | 'sesac' | 'gmr' | 'socan' | 'prs' | 'other' | 'none';
export type SampleRole = 'composer' | 'lyricist' | 'composer_lyricist';

export type SamplePerson = {
  name: string; legalName?: string; pro?: SamplePro; ipi?: string; email?: string;
  address?: string; citizenship?: string; domicile?: string; type?: 'person' | 'group' | 'company';
};

export const SAMPLE_PEOPLE: SamplePerson[] = [
  { name: 'Kesi Vale', legalName: 'Kesiah Vale', pro: 'ascap', ipi: '00712345678', email: 'kesi@northline.example', address: '14 Ferry Street, Portland, ME 04101', citizenship: 'US', domicile: 'US' },
  { name: 'Marco Dela', legalName: 'Marco Delacroix', email: 'marco@northline.example', citizenship: 'US', domicile: 'US' },
  { name: 'Dana Okafor', legalName: 'Dana Okafor', pro: 'bmi', ipi: '00623451987', email: 'dana@lowhours.example', citizenship: 'US', domicile: 'US' },
  { name: 'Theo Lind', legalName: 'Theodore Lind', pro: 'bmi', ipi: '00598712340', email: 'theo@lowhours.example', citizenship: 'SE', domicile: 'US' },
  { name: 'Rue Sato', legalName: 'Rue Sato', pro: 'ascap', email: 'rue@lowhours.example', citizenship: 'US', domicile: 'US' },
  { name: 'Vale Songs', legalName: 'Vale Songs LLC', pro: 'ascap', ipi: '00811122233', address: '14 Ferry Street, Portland, ME 04101', type: 'company' },
  { name: 'Northline Music Publishing', legalName: 'Northline Music Publishing LLC', pro: 'bmi', ipi: '00844455566', address: '200 Commercial Street, Portland, ME 04101', type: 'company' },
  { name: 'Northline Records', legalName: 'Northline Records LLC', address: '200 Commercial Street, Portland, ME 04101', citizenship: 'US', domicile: 'US', type: 'company' },
];

/** Per song: each writer's role and publisher (by name), and the year it was finished. */
export const SAMPLE_SONGS: Record<string, { completed?: number; altTitles?: string[]; writers: Record<string, { role?: SampleRole; publisher?: string }> }> = {
  glasshouse: { completed: 2026, writers: { 'Kesi Vale': { role: 'composer_lyricist', publisher: 'Vale Songs' }, 'Marco Dela': { role: 'composer' } } },
  'night-bus': { completed: 2025, writers: {
    'Dana Okafor': { role: 'composer_lyricist', publisher: 'Northline Music Publishing' },
    'Theo Lind': { role: 'composer', publisher: 'Northline Music Publishing' },
    'Rue Sato': { role: 'composer', publisher: 'Northline Music Publishing' } } },
  'static-hymn': { completed: 2025, writers: {
    'Dana Okafor': { role: 'composer', publisher: 'Northline Music Publishing' },
    'Theo Lind': { role: 'composer', publisher: 'Northline Music Publishing' },
    'Rue Sato': { role: 'composer', publisher: 'Northline Music Publishing' } } },
  'velvet-hours': { completed: 2024, writers: { 'Kesi Vale': { role: 'composer_lyricist', publisher: 'Vale Songs' } } },
  'paper-moons': { completed: 2024, altTitles: ['Paper Moon'], writers: { 'Kesi Vale': { role: 'composer_lyricist', publisher: 'Vale Songs' } } },
  'low-light': { writers: { 'Marco Dela': { role: 'composer' } } },
};

/** Every master is owned by the label; the ℗ year is the year it was first released (or recorded). */
export const SAMPLE_MASTER_OWNER = 'Northline Records';
export const SAMPLE_P_YEAR: Record<string, number> = {
  glasshouse: 2027, 'night-bus': 2025, 'night-bus-demo': 2025, 'static-hymn': 2025, 'velvet-hours': 2024, 'paper-moons': 2024,
};
