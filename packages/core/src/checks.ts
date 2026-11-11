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
    writers: { name: string; shareBp: number; pro: string | null; ipi: string | null; signed: boolean }[];
    isrcs: string[];
  }[];
};

export type SignatureFacts = { kind: 'signature' };

export type GrantFacts = {
  kind: 'grant';
  deadline: string;
  verifiedOn: string;
  fields: { label: string; value: string; limit: number }[];
};

export type ApprovalFacts = PayoutFacts | FilingFacts | SignatureFacts | GrantFacts;

// ---------- the registry ----------

type Rule<F extends ApprovalFacts = ApprovalFacts> = {
  id: string;
  title: string;
  appliesTo: ApprovalKind[];
  facts: F['kind'];
  severity: Severity;
  fix?: { label: string; href: string };
  check: (f: F, today: string) => { status: CheckStatus; message: string; inputs: string[] };
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
      const missing = paid(f).filter((p) => !p.taxForm);
      // A W-9 doesn't expire; a W-8 does.
      const expired = paid(f).filter((p) => isW8(p.taxForm) && p.taxExpiresOn && p.taxExpiresOn < f.paysOn);
      const inputs = paid(f).map((p) => `${p.name}: ${p.taxForm ?? 'no form'}${isW8(p.taxForm) && p.taxExpiresOn ? `, expires ${p.taxExpiresOn}` : ''}`);
      if (!missing.length && !expired.length) return pass('Every payee has a valid tax form.', inputs);
      return fail([
        ...(missing.length ? [`${names(missing.map((p) => p.name))} ${missing.length === 1 ? 'has' : 'have'} no tax form on file.`] : []),
        ...expired.map((p) => `${p.name}’s ${p.taxForm} expires before payday.`),
      ].join(' '), inputs);
    },
  },
  {
    id: 'ROY-03', title: 'Withholding for W-8 payees', appliesTo: ['money'], facts: 'payout', severity: 'block',
    fix: { label: 'Open payouts', href: '/money/payouts' },
    check: (f) => {
      const w8 = paid(f).filter((p) => isW8(p.taxForm));
      const wrong = w8.filter((p) => !p.treaty && p.withheldCents < Math.round(p.amountCents * 0.3));
      const inputs = w8.map((p) => `${p.name}: ${p.taxForm}, withheld ${formatMoney(p.withheldCents)}, treaty ${p.treaty ? 'recorded' : 'not recorded'}`);
      if (!w8.length) return pass('No payee in this batch is on a W-8.', inputs);
      if (!wrong.length) return pass('W-8 payees are withheld at 30% or have a treaty rate recorded.', inputs);
      return fail(`${names(wrong.map((p) => p.name))} ${wrong.length === 1 ? 'is' : 'are'} on a W-8 with ${formatMoney(wrong[0].withheldCents)} withheld and no treaty rate recorded. Withhold 30% or record the treaty country, article and rate.`, inputs);
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
    fix: { label: 'Open setup', href: '/onboarding/songwriting' },
    check: (f) => {
      const inputs = [`publishing mode: ${f.publishingMode ?? 'not set'}`];
      switch (f.publishingMode) {
        case 'self': return pass('You publish your own songs, so you can register them.', inputs);
        case 'publisher': return fail('Setup says a publisher handles your songs, so they register them. Prepare the packet for your publisher instead.', inputs);
        case 'writers_own': return fail('Your writers handle their own publishing, so this workspace doesn’t file as publisher. Prepare a packet for each writer to submit.', inputs);
        case 'we_publish': case 'we_administer':
          return { ...unknown(`You ${f.publishingMode === 'we_publish' ? 'publish' : 'administer'} your writers’ songs, which needs a signed ${f.publishingMode === 'we_publish' ? 'publishing' : 'admin'} agreement with each writer. Those agreements arrive with the publishing module.`), inputs };
        default: return unknown('Who publishes these songs isn’t set. Answer the songwriting step in setup.');
      }
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

const LEGAL: Rule<SignatureFacts>[] = [
  {
    id: 'LEG-06', title: 'Approved one at a time', appliesTo: ['signature'], facts: 'signature', severity: 'block',
    check: () => pass('Signatures are never approved in bulk. This one is approved on its own.'),
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

export const RULES: Rule[] = [...ROYALTIES, ...PUBLISHING, ...LEGAL, ...FUNDING] as Rule[];

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
