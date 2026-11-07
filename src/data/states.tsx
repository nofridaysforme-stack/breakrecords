// Copy for the five data states on Batch 2 screens. Each error says whether money or filings
// were affected; each blocked state names what is missing and who owns it.
import type { StateCopy } from '@/components/ui/ScreenState';

export const STATES: Record<'royalties' | 'statement' | 'payouts' | 'recoupment' | 'splits' | 'portal', StateCopy> = {
  royalties: {
    empty: { title: 'No income yet this period', text: 'Connect your distributor and I’ll import statements as they arrive. Most send them about 6 weeks after the month ends.', action: { label: 'Connect a distributor', href: '/settings/integrations' } },
    working: { agent: 'Royalties Agent', task: 'importing October statements', note: 'Numbers fill in when the import finishes. Usually under a minute.' },
    blocked: { title: 'October income for Glasshouse is on hold', text: <>Split v5 isn&apos;t signed by everyone, so its income waits in suspense. <strong>Owner: Legal Agent, waiting on Marco Dela.</strong></>, action: { label: 'Open the split', href: '/splits/gh-rec' } },
    error: { title: 'The SoundExchange import failed', text: <>Their file came back empty. <strong>No money moved and nothing was filed.</strong> SoundExchange income below still shows September.</>, meta: 'Error SX-204 · Nov 6, 7:40 · Audit AUD-7F3K-2280', retry: 'Retry import' },
    partial: { text: <><strong>Your PRO isn&apos;t connected.</strong> Performance royalties aren&apos;t in these numbers yet.</>, action: 'Connect' },
  },
  statement: {
    empty: { title: 'No statement for this period', text: 'Kesi Vale had no income in this period, so there is nothing to show.', action: { label: 'All statements', href: '/money/statements' } },
    working: { agent: 'Royalties Agent', task: 'building this statement', note: 'Every line will link back to its source row.' },
    blocked: { title: 'This statement is held', text: <>It can&apos;t be sent until split v5 is signed by all 4 parties. <strong>Owner: Legal Agent.</strong></>, action: { label: 'Open the split', href: '/splits/gh-rec' } },
    error: { title: 'This statement didn’t add up', text: <>The running balance was off by $0.01, so I stopped. <strong>Nothing was sent or paid.</strong> I&apos;m rechecking the rounding.</>, meta: 'Error ST-310 · Nov 6, 8:15 · Audit AUD-7F3K-2303', retry: 'Rebuild statement' },
    partial: { text: <><strong>SoundExchange lines are missing.</strong> This statement shows distributor income only until they arrive.</>, action: 'Connect SoundExchange' },
  },
  payouts: {
    empty: { title: 'No payout batches yet', text: 'When statements arrive I’ll prepare a batch and send it to you to approve. Nothing is paid without you.', action: { label: 'See royalties', href: '/money/royalties' } },
    working: { agent: 'Royalties Agent', task: 'preparing the October batch', note: 'You’ll get an approval card when it is ready.' },
    blocked: { title: 'The October batch can’t be approved yet', text: <>Rue Sato&apos;s tax form is missing, so her $214.20 would need 24% withheld. <strong>Owner: Rue Sato.</strong></>, action: { label: 'Open the batch', href: '/approvals/apr_payout_oct' } },
    error: { title: 'August: 1 payment failed', text: <>Theo Lind&apos;s $214.20 bounced; the bank details look out of date. <strong>The other 4 payments went out.</strong> His money is back in the balance.</>, meta: 'Error PO-422 · Sep 10 · Audit AUD-7F3K-2104', retry: 'Retry payment' },
    partial: { text: <><strong>Your payout account isn&apos;t verified.</strong> Batches can be approved but won&apos;t send until it is.</>, action: 'Verify account' },
  },
  recoupment: {
    empty: { title: 'Nothing to recoup', text: 'Add a cost or an advance and I’ll track it against the release’s income.', action: { label: 'See releases', href: '/releases' } },
    working: { agent: 'Royalties Agent', task: 'matching receipts to costs', note: 'Totals refresh when matching finishes.' },
    blocked: { title: 'Night Bus EP costs need receipts', text: <>Two costs have no receipt, so they don&apos;t count yet. <strong>Owner: you.</strong></>, action: { label: 'Open budgets', href: '/money/budgets' } },
    error: { title: 'Recoupment didn’t update', text: <>October income couldn&apos;t be applied. <strong>No money moved.</strong> Figures below are from September.</>, meta: 'Error RC-118 · Nov 6, 8:20 · Audit AUD-7F3K-2305', retry: 'Retry' },
    partial: { text: <><strong>The Night Bus advance terms aren&apos;t imported.</strong> I&apos;m assuming the full $5,000 is recoupable until you confirm.</>, action: 'Confirm terms' },
  },
  splits: {
    empty: { title: 'No splits set up yet', text: 'Start with a release. I’ll suggest a split from your deal template for you to approve.', action: { label: 'See releases', href: '/releases' } },
    working: { agent: 'Legal Agent', task: 'drafting a split from your template', note: 'The draft comes to you before anyone is asked to sign.' },
    blocked: { title: 'v5 is waiting on signatures', text: <>Payouts under v5 stay in suspense until all 4 parties sign. <strong>Owner: Legal Agent, waiting on Marco Dela.</strong></>, action: { label: 'See signatures', href: '/contracts' } },
    error: { title: 'The signature request didn’t send', text: <>The e-signature service timed out. <strong>Nothing was signed and v4 still applies.</strong></>, meta: 'Error ES-502 · Nov 6, 8:30 · Audit AUD-7F3K-2306', retry: 'Send again' },
    partial: { text: <><strong>E-signature isn&apos;t connected.</strong> You can edit splits, but sending for signatures waits until it is.</>, action: 'Connect' },
  },
  portal: {
    empty: { title: 'No earnings yet', text: 'When Northline pays you, your statements show up here with every line explained.', action: { label: 'Check your tax form', href: '/portal/tax' } },
    working: { agent: 'Royalties Agent', task: 'preparing your October statement', note: 'You’ll get an email when it’s ready.' },
    blocked: { title: 'Your payments are on hold', text: <>Your tax form expired, so payments wait until you send a new one. <strong>Owner: you.</strong></>, action: { label: 'Update tax form', href: '/portal/tax' } },
    error: { title: 'Your last payment bounced', text: <>Your bank returned $285.00. <strong>The money is safe</strong> and goes out again once you update your details.</>, meta: 'Error PO-422 · Nov 10 · Audit AUD-7F3K-2311', retry: 'Update bank details' },
    partial: { text: <><strong>Your September statement is still being checked.</strong> Totals show October only.</>, action: 'Notify me' },
  },
};
