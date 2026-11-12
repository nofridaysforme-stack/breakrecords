// The approval precondition engine. Every approval card is checked against hard rules before
// Approve turns on, so nobody can approve a payout, filing or signature that contradicts the
// rest of the label's data. Rules are pure: each backend gathers the facts (the mock from its
// fixtures, live from Postgres) and calls `runChecks`. Checks run when a card is shown and again
// on the server at the moment someone approves, because data can change in between.
//
// Each rule has an id (ROY-01), the approval types it applies to, a severity and a check:
//  * Block: Approve stays off while it fails.
//  * Warn: Approve stays on, but accepting the warning needs a typed reason (kept with the decision).
//  * A rule whose facts aren't recorded anywhere yet reports "Can't check yet". It never blocks:
//    a rule that can't be satisfied would make the card impossible to approve.
import { daysBetween, short } from './dates';
import type { DealTerms } from './dealSplit';
import { formatMoney } from './money';
import { BACKUP_RATE_BP, formValid, taxTreatment, withholding, type MissingFormPolicy } from './tax';
import type { ApprovalKind } from './approvals';

export type Severity = 'block' | 'warn';
export type CheckStatus = 'pass' | 'fail' | 'unknown';
export type CheckResult = {
  id: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  /** Plain words: what passed, what's wrong, or why it can't be checked yet. */
  message: string;
  /** Where to fix it. */
  fix?: { label: string; href: string };
  /** What the rule read, for the activity log. */
  inputs: string[];
};

// ---------- facts, gathered by each backend ----------

export type PayeeFact = {
  name: string;
  amountCents: number;
  /** Carried forward payees are listed, not paid. */
  status: 'included' | 'carried';
  /** A fully signed split version or agreement names them. */
  covered: boolean;
  /** Agreements naming them that aren't signed yet. */
  pendingAgreements: string[];
  taxForm: string | null;
  taxExpiresOn: string | null;
  withheldCents: number;
  /** A treaty country, article and rate are recorded (W-8 only). */
  treaty: boolean;
  /** The treaty's withholding rate, when one is recorded. */
  treatyRateBp?: number | null;
  /** The IRS told the label to backup withhold from this W-9 payee (a B-notice). */
  backupWithholding?: boolean;
  bankOnFile: boolean;
  /** Their most recent payout before this batch failed. */
  lastFailed: boolean;
  /** Their share in the split version in effect, if a split names them. */
  split: { node: string; version: number; terms: DealTerms; role: 'producer' | 'label' | 'artist' | 'feature' } | null;
  /** What their issued statement for the period says they're owed, if they have one. */
  statementNetCents: number | null;
};

export type PayoutFacts = {
  kind: 'payout';
  /** Last day of the statement period, and the day money leaves. */
  periodEnd: string;
  paysOn: string;
  minimumCents: number;
  /** What the workspace does when a payee has no valid form: hold them, or withhold 24%. */
  missingFormPolicy?: MissingFormPolicy;
  payees: PayeeFact[];
  /** Matched income in the period, by recording. */
  income: { recording: string; isrc: string | null; releasedOn: string | null; amountCents: number }[];
  /** Open audit flags on recordings that earn in this batch. */
  flags: { recording: string; note: string }[];
};

export type PublishingMode = 'self' | 'publisher' | 'we_publish' | 'we_administer' | 'writers_own';
export type FilingFacts = {
  kind: 'filing';
  org: string;
  /** Who owns or administers the songs (setup's songwriting step), or null if never set. */
  publishingMode?: PublishingMode | null;
  works: {
    title: string;
    writers: {
      name: string; shareBp: number; pro: string | null; ipi: string | null; signed: boolean;
      /** The signed, current publishing deal the workspace has with this writer, if any. */
      deal?: 'publishing' | 'co_publishing' | 'administration' | null;
      /** This writer's own publishing mode, when it differs from the workspace's. */
      mode?: PublishingMode | null;
    }[];
    isrcs: string[];
  }[];
};

export type SignatureFacts = {
  kind: 'signature';
  /** Clauses that differ from the playbook ("§4.2"), which the person decides on the card. */
  playbookDifferences?: string[];
  /** Who signs on the other side, and whether the label knows them. */
  counterparties?: { name: string; legalName: string | null; email: string | null; known: boolean }[];
  /** Producer points in the draft and the playbook's allowed range, when the deal has points. */
  points?: number | null;
  pointsRange?: [number, number] | null;
  /** When points start: from the first dollar or after recoupment, in the template and in the draft. */
  royaltyBase?: { template: 'first_dollar' | 'after_recoupment' | null; draft: 'first_dollar' | 'after_recoupment' | null };
};

/** A plan to move a release date. */
export type ReleasePlanFacts = {
  kind: 'release_plan';
  release: string;
  newDate: string;
  /** Days between the editorial pitch and the release, once the plan moves everything. */
  pitchLeadDays: number | null;
  /** Gate tasks that keep their place relative to the release (every one, when the plan moves them all). */
  gatesMoved: boolean;
  budgetCents: number;
  spentCents: number;
};

/** Accepting a funding offer. */
export type OfferFacts = {
  kind: 'offer';
  offer: string;
  /** The yearly income the offer's projections assume, and what statements show for the last 12 months. */
  assumedAnnualCents: number;
  actualAnnualCents: number | null;
  months: number;
  /** Repaid from income the label shares with artists, so they should agree first. */
  sharedWithArtists: boolean;
};

export type GrantFacts = {
  kind: 'grant';
  deadline: string;
  verifiedOn: string;
  fields: { label: string; value: string; limit: number }[];
};

/** A year's 1099-MISC and 1042-S filing. */
export type TaxYearFacts = {
  kind: 'tax_year';
  year: number;
  /** Paid in the year with no tax form on file. */
  missing: string[];
  /** Reportable 1099 payees whose taxpayer number isn't confirmed (no last four digits). */
  noTin: string[];
  forms: number;
};

export type ApprovalFacts = PayoutFacts | FilingFacts | SignatureFacts | GrantFacts | ReleasePlanFacts | OfferFacts | TaxYearFacts;

// ---------- the registry ----------

type Rule<F extends ApprovalFacts = ApprovalFacts> = {
  id: string;
  title: string;
  appliesTo: ApprovalKind[];
  facts: F['kind'];
  severity: Severity;
  fix?: { label: string; href: string };
  /** A result may soften the rule's severity (REL-01: under 7 days blocks, under 21 warns). */
  check: (f: F, today: string) => { status: CheckStatus; message: string; inputs: string[]; severity?: Severity };
};

const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (bp: number) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const pass = (message: string, inputs: string[] = []) => ({ status: 'pass' as const, message, inputs });
const fail = (message: string, inputs: string[] = []) => ({ status: 'fail' as const, message, inputs });
const unknown = (message: string) => ({ status: 'unknown' as const, message, inputs: [] });
const paid = (f: PayoutFacts) => f.payees.filter((p) => p.status === 'included');
const isW8 = (form: string | null) => !!form && form.startsWith('W-8');

const ROYALTIES: Rule<PayoutFacts>[] = [
  {
    id: 'ROY-01', title: 'Signed agreements', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open contracts', href: '/contracts' },
    check: (f) => {
      // A payee covered by a signed split or agreement passes, whatever else is still being signed.
      const pending = paid(f).filter((p) => !p.covered && p.pendingAgreements.length);
      const none = paid(f).filter((p) => !p.covered && !p.pendingAgreements.length);
      const inputs = paid(f).map((p) => `${p.name}: ${p.covered ? 'signed' : p.pendingAgreements.length ? `waiting on ${p.pendingAgreements.join(', ')}` : 'nothing signed'}`);
      if (!pending.length && !none.length) return pass('Every payee has a signed agreement or split.', inputs);
      const parts = [
        ...pending.map((p) => `${p.name}’s ${p.pendingAgreements.join(' and ')} isn’t signed yet.`),
        ...(none.length ? [`No signed agreement or split names ${names(none.map((p) => p.name))}.`] : []),
      ];
      return fail(parts.join(' '), inputs);
    },
  },
  {
    id: 'ROY-02', title: 'Tax forms', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open payouts', href: '/money/payouts' },
    check: (f) => {
      // A W-9 doesn't expire; a W-8 does.
      const invalid = paid(f).filter((p) => !formValid({ form: p.taxForm, expiresOn: p.taxExpiresOn }, f.paysOn));
      const inputs = [
        ...paid(f).map((p) => `${p.name}: ${p.taxForm ?? 'no form'}${isW8(p.taxForm) && p.taxExpiresOn ? `, expires ${p.taxExpiresOn}` : ''}`),
        `Missing forms: ${f.missingFormPolicy === 'withhold' ? '24% backup withholding' : 'hold the payout'}`,
      ];
      if (!invalid.length) return pass('Every payee has a valid tax form.', inputs);
      const why = [
        ...(invalid.some((p) => !p.taxForm) ? [`${names(invalid.filter((p) => !p.taxForm).map((p) => p.name))} ${invalid.filter((p) => !p.taxForm).length === 1 ? 'has' : 'have'} no tax form on file.`] : []),
        ...invalid.filter((p) => p.taxForm).map((p) => `${p.name}’s ${p.taxForm} expires before payday.`),
      ].join(' ');
      // The workspace pays them with 24% backup withholding instead of holding them.
      if (f.missingFormPolicy === 'withhold') {
        const short = invalid.filter((p) => p.withheldCents < withholding(p.amountCents, { kind: 'backup', rateBp: BACKUP_RATE_BP, label: '' }));
        if (!short.length) return pass(`${why} ${pct(BACKUP_RATE_BP)} backup withholding is applied.`, inputs);
        return fail(`${why} Withhold ${pct(BACKUP_RATE_BP)} from ${names(short.map((p) => p.name))}, or hold them.`, inputs);
      }
      return fail(why, inputs);
    },
  },
  {
    id: 'ROY-03', title: 'Withholding', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open payouts', href: '/money/payouts' },
    check: (f) => {
      // Payees with a valid form: W-8s at 30% or their treaty rate, W-9s under an IRS notice at 24%.
      const taxed = paid(f).filter((p) => formValid({ form: p.taxForm, expiresOn: p.taxExpiresOn }, f.paysOn) && (isW8(p.taxForm) || p.backupWithholding));
      const owed = (p: PayeeFact) => withholding(p.amountCents, taxTreatment({
        form: p.taxForm, expiresOn: p.taxExpiresOn, backupWithholding: p.backupWithholding,
        // A treaty recorded without its rate (older facts) is taken as covering the payment.
        treaty: p.treaty ? { country: '', article: '', rateBp: p.treatyRateBp ?? 0 } : null,
      }, f.paysOn, 'hold'));
      const inputs = taxed.map((p) => `${p.name}: ${p.taxForm}, withheld ${formatMoney(p.withheldCents)} of ${formatMoney(owed(p))} due, treaty ${p.treaty ? 'recorded' : 'not recorded'}`);
      if (!taxed.length) return pass('No payee in this batch needs tax withheld.', inputs);
      const wrong = taxed.filter((p) => p.withheldCents < owed(p));
      if (!wrong.length) return pass('Tax is withheld at the right rate for every payee who needs it.', inputs);
      const w8 = wrong.filter((p) => isW8(p.taxForm));
      const w9 = wrong.filter((p) => !isW8(p.taxForm));
      return fail([
        ...(w8.length ? [`${names(w8.map((p) => p.name))} ${w8.length === 1 ? 'is' : 'are'} on a W-8 with ${formatMoney(w8[0].withheldCents)} withheld and no treaty rate recorded. Withhold 30% or record the treaty country, article and rate.`] : []),
        ...(w9.length ? [`The IRS asked for backup withholding from ${names(w9.map((p) => p.name))}. Withhold ${pct(BACKUP_RATE_BP)}.`] : []),
      ].join(' '), inputs);
    },
  },
  {
    id: 'ROY-04', title: 'Income only from released recordings', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open royalties', href: '/money/royalties' },
    check: (f) => {
      const early = f.income.filter((i) => !i.releasedOn || i.releasedOn > f.periodEnd);
      const inputs = f.income.map((i) => `${i.recording}: ${i.releasedOn ? `released ${i.releasedOn}` : 'no release date'}, ${formatMoney(i.amountCents)}`);
      if (!early.length) return pass('Every recording that earned was released by the end of the period.', inputs);
      return fail(early.map((i) => i.releasedOn
        ? `${i.recording} earns ${formatMoney(i.amountCents)} before its ${short(i.releasedOn)}, ${i.releasedOn.slice(0, 4)} release.`
        : `${i.recording} earns ${formatMoney(i.amountCents)} but has no release date.`).join(' '), inputs);
    },
  },
  {
    id: 'ROY-05', title: 'Income matched by ISRC', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open catalog', href: '/catalog/recordings' },
    check: (f) => {
      const noIsrc = f.income.filter((i) => !i.isrc);
      const inputs = f.income.map((i) => `${i.recording}: ${i.isrc ?? 'no ISRC'}`);
      if (!noIsrc.length) return pass('Every income line points at a recording with an ISRC.', inputs);
      return fail(`${names(noIsrc.map((i) => i.recording))} ${noIsrc.length === 1 ? 'earns' : 'earn'} ${formatMoney(noIsrc.reduce((a, i) => a + i.amountCents, 0))} with no ISRC in the catalog. That income belongs in the unmatched queue, not with payees.`, inputs);
    },
  },
  {
    id: 'ROY-06', title: 'Amounts match the statements', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open statements', href: '/money/statements' },
    check: (f) => {
      // Each statement works the amount out from net receipts, costs and the split version in
      // effect (a checked waterfall). The payout must pay exactly what the statement says.
      const withStatement = paid(f).filter((p) => p.statementNetCents != null);
      const inputs = paid(f).map((p) => `${p.name}: paid ${formatMoney(p.amountCents)}, statement ${p.statementNetCents == null ? 'none' : formatMoney(p.statementNetCents)}`);
      if (!withStatement.length) return unknown('No payee in this batch has an issued statement to recompute from.');
      const off = withStatement.filter((p) => p.amountCents !== p.statementNetCents);
      if (!off.length) return pass(`${names(withStatement.map((p) => p.name))} ${withStatement.length === 1 ? 'is' : 'are'} paid exactly what ${withStatement.length === 1 ? 'their statement says' : 'their statements say'}.`, inputs);
      return fail(off.map((p) => `${p.name} is paid ${formatMoney(p.amountCents)}, but their statement says ${formatMoney(p.statementNetCents!)}.`).join(' '), inputs);
    },
  },
  {
    id: 'ROY-07', title: 'No open audit flags', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open activity', href: '/activity' },
    check: (f) => {
      const inputs = f.flags.map((x) => `${x.recording}: ${x.note}`);
      if (!f.flags.length) return pass('No recording in this batch has an open audit flag.', inputs);
      return fail(`${names(f.flags.map((x) => x.recording))} ${f.flags.length === 1 ? 'has' : 'have'} an open audit flag (${f.flags[0].note}). Move that income to reserve until it’s resolved.`, inputs);
    },
  },
  {
    id: 'ROY-08', title: 'Bank details', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open payouts', href: '/money/payouts' },
    check: (f) => {
      const noBank = paid(f).filter((p) => !p.bankOnFile);
      const failed = paid(f).filter((p) => p.bankOnFile && p.lastFailed);
      const inputs = paid(f).map((p) => `${p.name}: ${p.bankOnFile ? 'bank on file' : 'no bank'}${p.lastFailed ? ', last payout failed' : ''}`);
      if (!noBank.length && !failed.length) return pass('Every payee has bank details, and no earlier payout to them is still failed.', inputs);
      return fail([
        ...(noBank.length ? [`${names(noBank.map((p) => p.name))} ${noBank.length === 1 ? 'has' : 'have'} no bank details.`] : []),
        ...(failed.length ? [`The last payout to ${names(failed.map((p) => p.name))} failed and hasn’t been fixed.`] : []),
      ].join(' '), inputs);
    },
  },
  {
    id: 'ROY-09', title: 'Carried forward balances', appliesTo: ['money'], facts: 'payout', severity: 'warn',
    check: (f) => {
      const carried = f.payees.filter((p) => p.status === 'carried');
      const under = paid(f).filter((p) => p.amountCents < f.minimumCents);
      const inputs = [`minimum ${formatMoney(f.minimumCents)}`, ...carried.map((p) => `${p.name}: ${formatMoney(p.amountCents)} carried`)];
      if (under.length) return fail(`${names(under.map((p) => p.name))} ${under.length === 1 ? 'is' : 'are'} paid less than the ${formatMoney(f.minimumCents)} minimum.`, inputs);
      return pass(carried.length
        ? `${names(carried.map((p) => `${p.name} (${formatMoney(p.amountCents)})`))} ${carried.length === 1 ? 'carries' : 'carry'} forward, under the ${formatMoney(f.minimumCents)} minimum.`
        : `Nobody is under the ${formatMoney(f.minimumCents)} minimum.`, inputs);
    },
  },
];

const PUBLISHING: Rule<FilingFacts>[] = [
  {
    id: 'PUB-01', title: 'Split sheets signed', appliesTo: ['filing'], facts: 'filing', severity: 'block',
    fix: { label: 'Open songs', href: '/catalog/songs' },
    check: (f) => {
      const open = f.works.filter((w) => w.writers.some((x) => !x.signed));
      const inputs = f.works.map((w) => `${w.title}: ${w.writers.filter((x) => x.signed).length} of ${w.writers.length} signed`);
      if (!open.length) return pass('Every song’s split sheet is signed by all its writers.', inputs);
      return fail(open.map((w) => `${w.title}’s split sheet has ${w.writers.filter((x) => x.signed).length} of ${w.writers.length} signatures.`).join(' '), inputs);
    },
  },
  {
    id: 'PUB-02', title: 'Right to file as publisher', appliesTo: ['filing'], facts: 'filing', severity: 'block',
    fix: { label: 'Open contracts', href: '/contracts' },
    check: (f) => {
      // Each writer's own mode wins over the workspace's. Self-published writers file their own
      // songs; when the workspace publishes or administers, every writer needs a signed, current
      // deal of that kind; when a publisher or the writer handles it, the workspace never files.
      const writers = new Map<string, { mode: PublishingMode | null; deal: string | null }>();
      f.works.forEach((w) => w.writers.forEach((x) => writers.set(x.name, { mode: x.mode ?? f.publishingMode ?? null, deal: x.deal ?? null })));
      const list = [...writers.entries()];
      const inputs = [`workspace mode: ${f.publishingMode ?? 'not set'}`, ...list.map(([n, x]) => `${n}: ${x.mode ?? 'not set'}, deal ${x.deal ?? 'none'}`)];
      if (list.some(([, x]) => !x.mode)) return { ...unknown('Who publishes these songs isn’t set. Answer the songwriting step in setup.'), inputs };
      const own = list.filter(([, x]) => x.mode === 'writers_own' || x.mode === 'publisher').map(([n]) => n);
      const needs = (mode: PublishingMode | null) => (mode === 'we_publish' ? ['publishing', 'co_publishing'] : mode === 'we_administer' ? ['publishing', 'co_publishing', 'administration'] : null);
      const missing = list.filter(([, x]) => { const ok = needs(x.mode); return ok && !(x.deal && ok.includes(x.deal)); }).map(([n, x]) => [n, x.mode] as const);
      if (!own.length && !missing.length) {
        return pass(list.every(([, x]) => x.mode === 'self') ? 'You publish your own songs, so you can register them.' : 'Every writer has a signed, current publishing or admin agreement with you.', inputs);
      }
      return fail([
        ...(own.length ? [`${names(own)} ${own.length === 1 ? 'handles' : 'handle'} their own publishing (or a publisher does), so this workspace doesn’t file for them. Prepare a packet for them to submit.`] : []),
        ...(missing.length ? [`No signed, current ${missing[0][1] === 'we_publish' ? 'publishing' : 'publishing or admin'} agreement with ${names(missing.map(([n]) => n))}.`] : []),
      ].join(' '), inputs);
    },
  },
  {
    id: 'PUB-03', title: 'Writer PRO and IPI', appliesTo: ['filing'], facts: 'filing', severity: 'block',
    fix: { label: 'Open songs', href: '/catalog/songs' },
    check: (f) => {
      const writers = new Map<string, { pro: string | null; ipi: string | null }>();
      f.works.forEach((w) => w.writers.forEach((x) => writers.set(x.name, x)));
      const missing = [...writers.entries()].filter(([, x]) => !x.pro || !x.ipi);
      const inputs = [...writers.entries()].map(([n, x]) => `${n}: PRO ${x.pro ? x.pro.toUpperCase() : 'missing'}, IPI ${x.ipi ?? 'missing'}`);
      if (!missing.length) return pass('Every writer has a PRO and an IPI recorded.', inputs);
      return fail(missing.map(([n, x]) => `${n} has no ${[!x.pro && 'PRO', !x.ipi && 'IPI'].filter(Boolean).join(' or ')} recorded.`).join(' '), inputs);
    },
  },
  {
    id: 'PUB-04', title: 'Shares total 100%', appliesTo: ['filing'], facts: 'filing', severity: 'block',
    fix: { label: 'Open songs', href: '/catalog/songs' },
    check: (f) => {
      const off = f.works.filter((w) => w.writers.reduce((a, x) => a + x.shareBp, 0) !== 10000);
      const inputs = f.works.map((w) => `${w.title}: ${pct(w.writers.reduce((a, x) => a + x.shareBp, 0))}`);
      if (!off.length) return pass('Writer shares total exactly 100% on every song.', inputs);
      return fail(off.map((w) => `${w.title}’s writer shares total ${pct(w.writers.reduce((a, x) => a + x.shareBp, 0))}.`).join(' '), inputs);
    },
  },
  {
    id: 'PUB-05', title: 'Linked recording with an ISRC', appliesTo: ['filing'], facts: 'filing', severity: 'block',
    fix: { label: 'Open catalog', href: '/catalog/recordings' },
    check: (f) => {
      const none = f.works.filter((w) => !w.isrcs.length);
      const inputs = f.works.map((w) => `${w.title}: ${w.isrcs.join(', ') || 'no ISRC'}`);
      if (!none.length) return pass('Every song links to a recording with an ISRC.', inputs);
      return fail(`${names(none.map((w) => w.title))} ${none.length === 1 ? 'has' : 'have'} no recording with an ISRC.`, inputs);
    },
  },
  {
    id: 'PUB-06', title: 'Not already registered', appliesTo: ['filing'], facts: 'filing', severity: 'warn',
    check: (f) => unknown(`The ${f.org} can’t be searched from here yet, so a duplicate registration can’t be ruled out.`),
  },
];

const BASE = { first_dollar: 'from the first dollar', after_recoupment: 'after recoupment' } as const;
const LEGAL: Rule<SignatureFacts>[] = [
  {
    id: 'LEG-01', title: 'Playbook differences decided', appliesTo: ['signature'], facts: 'signature', severity: 'warn',
    check: (f) => {
      const d = f.playbookDifferences ?? [];
      if (!d.length) return pass('Every clause matches your playbook.', []);
      // Decided on the card: each one goes out with the playbook's wording or as drafted, with a reason.
      return fail(`${d.length === 1 ? `${d[0]} differs` : `${names(d)} differ`} from your playbook. Choose the playbook wording or keep the draft, and say why.`, d);
    },
  },
  {
    id: 'LEG-02', title: 'Matches its template', appliesTo: ['signature'], facts: 'signature', severity: 'warn',
    fix: { label: 'Open contracts', href: '/contracts' },
    check: (f) => {
      const b = f.royaltyBase;
      if (!b?.template || !b.draft) return unknown('The template or the draft doesn’t say when points start, so they can’t be compared.');
      const inputs = [`template: ${BASE[b.template]}`, `draft: ${BASE[b.draft]}`];
      return b.template === b.draft ? pass(`The draft and its template both pay ${BASE[b.draft]}.`, inputs)
        : fail(`The template pays ${BASE[b.template]}, but the draft pays ${BASE[b.draft]}.`, inputs);
    },
  },
  {
    id: 'LEG-03', title: 'Counterparty details', appliesTo: ['signature'], facts: 'signature', severity: 'block',
    fix: { label: 'Open roster', href: '/roster' },
    check: (f) => {
      const c = f.counterparties ?? [];
      if (!c.length) return unknown('The agreement doesn’t name anyone on the other side yet.');
      const inputs = c.map((x) => `${x.name}: legal name ${x.legalName ?? 'missing'}, email ${x.email ? 'on file' : 'missing'}, ${x.known ? 'on the roster or invited' : 'unknown to the label'}`);
      const bad = c.flatMap((x) => [!x.legalName && `${x.name} has no legal name`, !x.email && `${x.name} has no email`, !x.known && `${x.name} isn’t on your roster or invited`].filter(Boolean) as string[]);
      return bad.length ? fail(`${bad.join('. ')}.`, inputs) : pass(`${names(c.map((x) => x.name))} ${c.length === 1 ? 'is' : 'are'} on file with a legal name and email.`, inputs);
    },
  },
  {
    id: 'LEG-04', title: 'Terms within the playbook', appliesTo: ['signature'], facts: 'signature', severity: 'warn',
    check: (f) => {
      if (f.points == null || !f.pointsRange) return pass('No numeric terms in this agreement have a playbook range.', []);
      const [lo, hi] = f.pointsRange;
      const inputs = [`points: ${f.points}`, `playbook: ${lo} to ${hi}`];
      return f.points >= lo && f.points <= hi ? pass(`${f.points} points is within your playbook’s ${lo} to ${hi}.`, inputs)
        : fail(`${f.points} points is outside your playbook’s ${lo} to ${hi}.`, inputs);
    },
  },
  {
    id: 'LEG-05', title: 'No conflict with signed agreements', appliesTo: ['signature'], facts: 'signature', severity: 'warn',
    check: () => unknown('Approval rights, exclusivity and option dates in your other signed agreements aren’t compared yet.'),
  },
  {
    id: 'LEG-06', title: 'Approved one at a time', appliesTo: ['signature'], facts: 'signature', severity: 'block',
    check: () => pass('Signatures are never approved in bulk. This one is approved on its own.'),
  },
];

const RELEASE: Rule<ReleasePlanFacts>[] = [
  {
    id: 'REL-01', title: 'Editorial pitch in time', appliesTo: ['plan'], facts: 'release_plan', severity: 'block',
    fix: { label: 'Open the release', href: '/releases' },
    check: (f) => {
      if (f.pitchLeadDays == null) return unknown(`${f.release} has no pitch step in its runbook yet.`);
      const inputs = [`pitch ${f.pitchLeadDays} days before release`];
      if (f.pitchLeadDays < 7) return fail(`The editorial pitch goes in ${f.pitchLeadDays} days before release. Spotify needs at least 7.`, inputs);
      if (f.pitchLeadDays < 21) return { ...fail(`The editorial pitch goes in ${f.pitchLeadDays} days before release. Aim for 21 to 28.`, inputs), severity: 'warn' as const };
      return pass(`The editorial pitch goes in ${f.pitchLeadDays} days before release.`, inputs);
    },
  },
  {
    id: 'REL-02', title: 'Within the release budget', appliesTo: ['plan'], facts: 'release_plan', severity: 'block',
    check: (f) => {
      const inputs = [`budget ${formatMoney(f.budgetCents)}`, `spent ${formatMoney(f.spentCents)}`];
      return f.spentCents <= f.budgetCents ? pass(`${formatMoney(f.spentCents)} of the ${formatMoney(f.budgetCents)} budget is spent.`, inputs)
        : fail(`Spending is ${formatMoney(f.spentCents - f.budgetCents)} over the ${formatMoney(f.budgetCents)} budget. Raising it is its own plan.`, inputs);
    },
  },
  {
    id: 'REL-03', title: 'Every gate date moves', appliesTo: ['plan'], facts: 'release_plan', severity: 'block',
    check: (f) => (f.gatesMoved ? pass('Every gate and task after today moves with the new date, and each owner is told.', []) : fail('Some gates would keep their old dates.', [])),
  },
];

const OFFERS: Rule<OfferFacts>[] = [
  {
    id: 'FUN-04', title: 'Projections from real income', appliesTo: ['money', 'plan'], facts: 'offer', severity: 'block',
    fix: { label: 'Open the comparison', href: '/funding/offers/compare' },
    check: (f) => {
      if (f.actualAnnualCents == null) return unknown('There are no statements yet to check the projection against.');
      const inputs = [`assumed ${formatMoney(f.assumedAnnualCents)} a year`, `statements: ${formatMoney(f.actualAnnualCents)} a year (${f.months} month${f.months === 1 ? '' : 's'})`];
      const off = Math.abs(f.assumedAnnualCents - f.actualAnnualCents) / Math.max(1, f.actualAnnualCents);
      return off <= 0.25 ? pass(`The projection assumes ${formatMoney(f.assumedAnnualCents)} a year, in line with your statements.`, inputs)
        : fail(`The projection assumes ${formatMoney(f.assumedAnnualCents)} a year, but your statements show about ${formatMoney(f.actualAnnualCents)} a year. Update the assumption and re-compare before accepting.`, inputs);
    },
  },
  {
    id: 'FUN-05', title: 'Artists agree first', appliesTo: ['money', 'plan'], facts: 'offer', severity: 'block',
    check: (f) => (f.sharedWithArtists ? unknown('This is repaid from income you share with artists. Their consent isn’t recorded in the app yet; get it in writing first.') : pass('Repaid only from the label’s own share.', [])),
  },
];

const FUNDING: Rule<GrantFacts>[] = [
  {
    id: 'FUN-01', title: 'Eligibility', appliesTo: ['plan', 'filing'], facts: 'grant', severity: 'block',
    check: () => unknown('Eligibility profiles (label or artist, residency) aren’t recorded yet, so the funder’s rules can’t be checked.'),
  },
  {
    id: 'FUN-02', title: 'Application complete', appliesTo: ['plan', 'filing'], facts: 'grant', severity: 'block',
    check: (f) => {
      const empty = f.fields.filter((x) => !x.value.trim());
      const long = f.fields.filter((x) => x.value.length > x.limit);
      const inputs = f.fields.map((x) => `${x.label}: ${x.value.length} of ${x.limit} characters`);
      if (!empty.length && !long.length) return pass('Every field is filled and within its limit, and the full text is on this card.', inputs);
      return fail([
        ...(empty.length ? [`${names(empty.map((x) => x.label))} ${empty.length === 1 ? 'is' : 'are'} empty.`] : []),
        ...long.map((x) => `${x.label} is over its ${x.limit}-character limit.`),
      ].join(' '), inputs);
    },
  },
  {
    id: 'FUN-03', title: 'Deadline checked recently', appliesTo: ['plan', 'filing'], facts: 'grant', severity: 'block',
    fix: { label: 'Open funding', href: '/funding' },
    check: (f, today) => {
      const left = daysBetween(today, f.deadline);
      const age = daysBetween(f.verifiedOn, today);
      const inputs = [`today ${today}`, `deadline ${f.deadline}`, `verified ${f.verifiedOn}`];
      if (left < 0) return fail(`The deadline, ${short(f.deadline)}, has passed.`, inputs);
      if (age > 7) return fail(`The deadline (${short(f.deadline)}, ${left} day${left === 1 ? '' : 's'} from today) was last checked on ${short(f.verifiedOn)}, ${age} days ago. Re-check the program page first.`, inputs);
      return pass(`Due ${short(f.deadline)}, ${left} day${left === 1 ? '' : 's'} from today, checked ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}.`, inputs);
    },
  },
];

const TAX: Rule<TaxYearFacts>[] = [
  {
    id: 'TAX-01', title: 'A form for everyone paid', appliesTo: ['filing'], facts: 'tax_year', severity: 'block',
    fix: { label: 'Open payouts', href: '/money/payouts' },
    check: (f) => {
      const inputs = [`${f.forms} form${f.forms === 1 ? '' : 's'} to file for ${f.year}`, ...f.missing.map((m) => `${m}: no form`)];
      return f.missing.length
        ? fail(`${names(f.missing)} ${f.missing.length === 1 ? 'was' : 'were'} paid in ${f.year} with no tax form on file. Get their form before filing.`, inputs)
        : pass(`Everyone paid in ${f.year} has a tax form on file.`, inputs);
    },
  },
  {
    id: 'TAX-02', title: 'Taxpayer numbers confirmed', appliesTo: ['filing'], facts: 'tax_year', severity: 'warn',
    check: (f) => {
      const inputs = f.noTin.map((m) => `${m}: last 4 digits not on file`);
      return f.noTin.length
        ? fail(`${names(f.noTin)}’s taxpayer number isn’t confirmed. Check it with your payout provider before filing.`, inputs)
        : pass('Every 1099 payee’s taxpayer number is confirmed.', inputs);
    },
  },
];

export const RULES: Rule[] = [...ROYALTIES, ...PUBLISHING, ...LEGAL, ...RELEASE, ...OFFERS, ...FUNDING, ...TAX] as Rule[];

/** Every rule that applies to this card, with its result. No facts means no rules apply. */
export function runChecks(type: ApprovalKind, facts: ApprovalFacts | null | undefined, today: string): CheckResult[] {
  if (!facts) return [];
  return RULES.filter((r) => r.facts === facts.kind && r.appliesTo.includes(type)).map((r) => {
    const out = r.check(facts, today);
    return { id: r.id, title: r.title, severity: r.severity, ...out, ...(r.fix && out.status === 'fail' ? { fix: r.fix } : {}) };
  });
}

export type Gate = {
  /** Block rules that failed: Approve stays off. */
  blocks: CheckResult[];
  /** Warn rules that failed: approving needs a typed reason. */
  warns: CheckResult[];
};

export function gate(results: CheckResult[]): Gate {
  return {
    blocks: results.filter((r) => r.status === 'fail' && r.severity === 'block'),
    warns: results.filter((r) => r.status === 'fail' && r.severity === 'warn'),
  };
}
