// Copy for the five data states on Batch 3 screens. Errors say whether money or filings were
// affected; blocked states name what is missing and who owns it.
import type { StateCopy } from '@/components/ui/ScreenState';

type Key = 'catalog' | 'contracts' | 'template' | 'registrations' | 'unclaimed' | 'claims' | 'funding' | 'offers'
  | 'departments' | 'activity' | 'settings' | 'theme' | 'roster';

export const OPS_STATES: Record<Key, StateCopy> = {
  catalog: {
    empty: { title: 'Your catalog is empty', text: 'Upload your first recording, or connect your distributor and I’ll import what’s already out.', action: { label: 'Connect a distributor', href: '/settings/integrations' } },
    working: { agent: 'Metadata Agent', task: 'importing your catalog', note: 'Recordings appear as each one is matched to its ISRC.' },
    blocked: { title: 'Low Light can’t be delivered yet', text: <>It has no ISRC, so stores and SoundExchange can&apos;t pay it. <strong>Owner: Metadata Agent, waiting on Marco Dela&apos;s credits.</strong></>, action: { label: 'See registrations', href: '/rights/registrations' } },
    error: { title: 'The catalog import stopped', text: <>The distributor sent a file I couldn&apos;t read. <strong>Nothing was changed or filed.</strong> What you see is from Nov 5.</>, meta: 'Error CT-210 · Nov 6, 7:55 · Audit AUD-7F3K-2290', retry: 'Retry import' },
    partial: { text: <><strong>Song details from your PRO aren&apos;t connected.</strong> ISWCs may be missing until they are.</>, action: 'Connect' },
  },
  contracts: {
    empty: { title: 'No contracts yet', text: 'Draft one from a template, or upload one and Legal Agent will review it against your playbook.', action: { label: 'See templates', href: '/contracts/templates/artist' } },
    working: { agent: 'Legal Agent', task: 'reading your uploaded contracts', note: 'Key dates and terms appear when each review finishes.' },
    blocked: { title: 'The Glasshouse producer agreement is waiting on you', text: <>Two terms need your eyes before Marco Dela can sign. <strong>Owner: you.</strong></>, action: { label: 'Review agreement', href: '/approvals/apr_producer' } },
    error: { title: 'Signature status didn’t refresh', text: <>The e-signature service didn&apos;t answer. <strong>Nothing was signed or sent.</strong> Statuses below are from 8:30.</>, meta: 'Error ES-503 · Nov 6, 8:45 · Audit AUD-7F3K-2307', retry: 'Refresh' },
    partial: { text: <><strong>E-signature isn&apos;t connected.</strong> Signature status shows only what you uploaded.</>, action: 'Connect' },
  },
  template: {
    empty: { title: 'This template is blank', text: 'Add clauses or start from one of the standard templates.', action: { label: 'All contracts', href: '/contracts' } },
    working: { agent: 'Legal Agent', task: 'updating this template', note: 'You approve the new version before anyone sees it.' },
    blocked: { title: 'This template is out of date', text: <>A newer version is waiting for your approval. <strong>Owner: you.</strong></>, action: { label: 'See approvals', href: '/approvals' } },
    error: { title: 'This template didn’t load', text: <>I couldn&apos;t read the latest version. <strong>No contracts were changed.</strong></>, meta: 'Error TP-404 · Nov 6, 8:50 · Audit AUD-7F3K-2308', retry: 'Retry' },
    partial: { text: <><strong>Playbook notes are missing.</strong> Legal Agent can&apos;t flag terms against this template until you add them.</>, action: 'Add notes' },
  },
  registrations: {
    empty: { title: 'Nothing to register yet', text: 'Add a recording to your catalog and I’ll list every place it needs registering to get paid.', action: { label: 'Open catalog', href: '/catalog/recordings' } },
    working: { agent: 'Rights Agent', task: 'checking registration status', note: 'Each cell updates as its organization answers.' },
    blocked: { title: '3 MLC filings are waiting on you', text: <>Mechanical royalties for these songs stay unmatched until they&apos;re filed. <strong>Owner: you.</strong></>, action: { label: 'Open filing', href: '/approvals/apr_mlc' } },
    error: { title: 'SoundExchange status didn’t refresh', text: <>Their service timed out. <strong>Nothing was filed or changed.</strong> SoundExchange cells show Nov 5.</>, meta: 'Error SX-208 · Nov 6, 8:10 · Audit AUD-7F3K-2295', retry: 'Retry' },
    partial: { text: <><strong>Neighboring rights societies aren&apos;t connected.</strong> That column shows what Rights Agent prepared only.</>, action: 'Connect' },
  },
  unclaimed: {
    empty: { title: 'No unclaimed money found', text: 'Rights Agent checks SoundExchange and the MLC every week for royalties waiting for you.', action: { label: 'See registrations', href: '/rights/registrations' } },
    working: { agent: 'Rights Agent', task: 'searching for unclaimed royalties', note: 'Usually takes a few minutes per organization.' },
    blocked: { title: 'The MLC claim waits on the filing', text: <>It goes in with the MLC filing for Night Bus. <strong>Owner: you.</strong></>, action: { label: 'Open filing', href: '/approvals/apr_mlc' } },
    error: { title: 'The MLC search failed', text: <>Their search returned an error. <strong>Nothing was claimed or filed.</strong> SoundExchange results below are current.</>, meta: 'Error MLC-311 · Nov 6, 8:12 · Audit AUD-7F3K-2296', retry: 'Search again' },
    partial: { text: <><strong>SoundExchange isn&apos;t connected.</strong> Its amount is an estimate from their public search.</>, action: 'Connect' },
  },
  claims: {
    empty: { title: 'No artist profiles yet', text: 'Add an artist to your roster and I’ll prepare each profile claim.', action: { label: 'Open roster', href: '/roster' } },
    working: { agent: 'Rights Agent', task: 'checking profile claims', note: 'Each service answers on its own schedule.' },
    blocked: { title: 'Marco Dela’s Spotify claim is waiting', text: <>Spotify sent a code to Marco&apos;s email. <strong>Owner: Marco Dela.</strong></>, action: { label: 'Open roster', href: '/roster' } },
    error: { title: 'Apple Music didn’t answer', text: <>The claim check timed out. <strong>Nothing was submitted.</strong></>, meta: 'Error PC-120 · Nov 6, 8:14 · Audit AUD-7F3K-2297', retry: 'Retry' },
    partial: { text: <><strong>YouTube isn&apos;t connected.</strong> Its column shows what Rights Agent prepared only.</>, action: 'Connect' },
  },
  funding: {
    empty: { title: 'No funding found this week', text: 'Funding Scout checks grants and offers every Monday. I’ll tell you when something fits.', action: { label: 'See applications', href: '/funding/applications' } },
    working: { agent: 'Funding Scout', task: 'checking 41 funding sources', note: 'Free money is listed first, then offers with their true cost.' },
    blocked: { title: 'The grant draft needs your budget', text: <>The application asks for a project budget. <strong>Owner: you.</strong> Due Nov 15.</>, action: { label: 'Open draft', href: '/approvals/apr_grant' } },
    error: { title: 'Funding Scout’s weekly check failed', text: <>Two sources didn&apos;t answer. <strong>Nothing was applied for or accepted.</strong> Cards below are from Nov 4.</>, meta: 'Error FS-140 · Nov 6, 6:00 · Audit AUD-7F3K-2288', retry: 'Check again' },
    partial: { text: <><strong>Your income history is 3 months short.</strong> Fit scores are less certain until a full year is imported.</>, action: 'Import history' },
  },
  offers: {
    empty: { title: 'No offers to compare', text: 'When you receive an advance or sale offer, I’ll set it side by side with doing nothing.', action: { label: 'Back to funding', href: '/funding' } },
    working: { agent: 'Finance Agent', task: 'reading the offer documents', note: 'Every number is worked out from your own income.' },
    blocked: { title: 'The sale offer is missing its terms', text: <>The buyer hasn&apos;t sent the buy-back terms. <strong>Owner: the buyer.</strong> I asked on Nov 4.</>, action: { label: 'Back to funding', href: '/funding' } },
    error: { title: 'The comparison didn’t update', text: <>Your latest income couldn&apos;t be read. <strong>Nothing was accepted or signed.</strong> Numbers below use September.</>, meta: 'Error FA-212 · Nov 6, 8:18 · Audit AUD-7F3K-2299', retry: 'Recalculate' },
    partial: { text: <><strong>Bandcamp income isn&apos;t included.</strong> It adds about $40 a month, so both offers cost slightly more than shown.</>, action: 'Connect' },
  },
  departments: {
    empty: { title: 'No departments on yet', text: 'Pick a profile and I’ll turn on the departments it needs.', action: { label: 'Choose a profile', href: '/onboarding/welcome' } },
    working: { agent: 'Label Head', task: 'setting up departments', note: 'Each department starts at Draft and wait.' },
    blocked: { title: 'Audit Agent is blocked', text: <>It needs the distributor&apos;s stream report to finish the Night Bus check. <strong>Owner: Distribution Agent.</strong></>, action: { label: 'See activity', href: '/activity' } },
    error: { title: 'Autonomy changes didn’t save', text: <>The last change was rolled back. <strong>Nothing ran under the new setting.</strong></>, meta: 'Error DP-302 · Nov 6, 8:22 · Audit AUD-7F3K-2300', retry: 'Try again' },
    partial: { text: <><strong>Agent spend for November isn&apos;t in yet.</strong> Task counts are up to date; spend is from October.</>, action: 'Refresh' },
  },
  activity: {
    empty: { title: 'Nothing has happened yet', text: 'Every agent run, tool call, approval and edit shows here with its inputs and outputs.', action: { label: 'Go home', href: '/' } },
    working: { agent: 'Audit Agent', task: 'loading the log', note: 'Newest first.' },
    blocked: { title: 'Older entries are archived', text: <>Entries before Oct 1 move to cold storage. <strong>Owner: you</strong>, under Billing.</>, action: { label: 'Open billing', href: '/settings/billing' } },
    error: { title: 'The log didn’t load fully', text: <>Entries after 9:12 aren&apos;t shown. <strong>Nothing was lost</strong>; they&apos;re still recorded.</>, meta: 'Error AL-500 · Nov 6, 9:20 · Audit AUD-7F3K-2312', retry: 'Reload' },
    partial: { text: <><strong>Tool call details are trimmed.</strong> Full inputs are in the export.</>, action: 'Export' },
  },
  settings: {
    empty: { title: 'No settings yet', text: 'Finish setup and your label’s settings appear here.', action: { label: 'Finish setup', href: '/onboarding/welcome' } },
    working: { agent: 'Label Head', task: 'loading your settings', note: 'Nothing changes until you save.' },
    blocked: { title: 'Accounting is disconnected', text: <>Its token expired, so statements can&apos;t sync to your books. <strong>Owner: you.</strong></>, action: { label: 'Open integrations', href: '/settings/integrations' } },
    error: { title: 'Your last change didn’t save', text: <>The routing rule kept its old value. <strong>No approvals were rerouted.</strong></>, meta: 'Error SE-410 · Nov 6, 8:25 · Audit AUD-7F3K-2301', retry: 'Try again' },
    partial: { text: <><strong>SoundExchange isn&apos;t connected.</strong> Its royalties are missing from statements until it is.</>, action: 'Connect' },
  },
  theme: {
    empty: { title: 'No theme yet', text: 'Start from the default theme, then add your logo and colors.', action: { label: 'Back to settings', href: '/settings/routing' } },
    working: { agent: 'Label Head', task: 'applying the theme', note: 'The preview updates as each color loads.' },
    blocked: { title: 'The domain isn’t live yet', text: <>app.harborsound.co waits for its CNAME record. <strong>Owner: Harbor Sound&apos;s DNS admin.</strong></>, action: { label: 'See DNS steps', href: '#dns' } },
    error: { title: 'The logo didn’t upload', text: <>The file was over 2 MB. <strong>The published theme is unchanged.</strong></>, meta: 'Error WL-413 · Nov 6, 8:27 · Audit AUD-7F3K-2302', retry: 'Try again' },
    partial: { text: <><strong>Email sender isn&apos;t verified.</strong> Emails go from Break Records until it is.</>, action: 'Verify' },
  },
  roster: {
    empty: { title: 'No artists yet', text: 'Add an artist and I’ll set up their profile, contract and payee details.', action: { label: 'Draft an artist agreement', href: '/contracts/templates/artist' } },
    working: { agent: 'Roster Agent', task: 'loading your roster', note: 'Income is from the latest statements.' },
    blocked: { title: 'Rue Sato’s tax form expires Dec 1', text: <>Payments to Rue stop after that until a new form is in. <strong>Owner: Rue Sato.</strong></>, action: { label: 'Open payouts', href: '/money/payouts' } },
    error: { title: 'October income didn’t load', text: <>Figures below are from September. <strong>No money moved.</strong></>, meta: 'Error RS-220 · Nov 6, 8:29 · Audit AUD-7F3K-2304', retry: 'Retry' },
    partial: { text: <><strong>Marco Dela has no payee details.</strong> His income waits until he adds them.</>, action: 'Ask Marco' },
  },
};
