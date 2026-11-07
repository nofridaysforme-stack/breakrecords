// What the Label Head panel knows about each screen (flows.md: "answers questions about what's
// on screen"). Scripted for the mock; first person, and it says when it hasn't checked something.
export type ScreenContext = { title: string; summary: string; qa: { q: string; a: string; basis: string }[] };

const CONTEXTS: [prefix: string, ctx: ScreenContext][] = [
  ['/approvals', { title: 'Approvals', summary: '4 items need you. The payout batch and the MLC filing are low risk; Marco’s producer agreement has 2 terms that need your eyes.', qa: [
    { q: 'What should I do first?', a: 'Marco’s producer agreement. It’s due Nov 9 and the split sheets for Glasshouse wait on it.', basis: 'Due dates and the Glasshouse runbook.' },
    { q: 'Can I approve everything at once?', a: 'Only the low-risk ones. Signatures are never bulk-approved, so the producer agreement stays out of a bulk approve.', basis: 'Your approval routing in Settings.' },
  ] }],
  ['/releases', { title: 'Releases', summary: 'Glasshouse is on track for March 5 and on budget: $1,860.00 of $3,000.00 spent. Three things block the next gate.', qa: [
    { q: 'What’s blocking Glasshouse?', a: 'Marco hasn’t signed the split sheet, the master WAV isn’t uploaded, and credits wait on the producer agreement.', basis: 'The Glasshouse runbook.' },
    { q: 'Can we move the date?', a: 'Yes. Use Change date on the runbook. I’ll recalculate every task and send you the change as a Plan approval.', basis: 'How date changes work.' },
  ] }],
  ['/catalog', { title: 'Catalog', summary: '7 recordings shown. Low Light has no ISRC yet, so it can’t be delivered or paid.', qa: [
    { q: 'Why is Low Light at 46%?', a: 'It’s missing the ISRC, genre and most credits. Metadata Agent asked Marco Dela for the credits.', basis: 'Low Light’s metadata.' },
    { q: 'What does AI use mean here?', a: 'Stores ask you to declare any AI in the audio, lyrics or art. Low Light declares AI-made stems.', basis: 'The AI use field.' },
  ] }],
  ['/money/statements', { title: 'Statements', summary: 'October statements are ready for Kesi Vale and Marco Dela. Every line links back to its source.', qa: [
    { q: 'Why is Kesi’s share lower this month?', a: 'Split v5 isn’t signed yet, so October pays under v4. Her share changes only once everyone signs v5.', basis: 'Split versions for Glasshouse.' },
  ] }],
  ['/money', { title: 'Money', summary: 'October income is $14,286.40, up 18% on September. The payout batch of $1,240.18 waits on your approval.', qa: [
    { q: 'Why can’t I pay Rue Sato?', a: 'Her tax form expires Dec 1. You can still pay the others now and ask Rue for a new form.', basis: 'Payee tax forms.' },
    { q: 'What’s the $312.40 unclaimed?', a: 'SoundExchange and the MLC are holding royalties for “Night Bus”. Each needs one claim.', basis: 'Rights Agent’s weekly search.' },
  ] }],
  ['/splits', { title: 'Splits', summary: 'Glasshouse recording income uses v4. Draft v5 is 5% short of 100%, so it can’t be sent for signatures yet.', qa: [
    { q: 'Where did the 5% go?', a: 'In v5 the label’s share of net profit is 40% and Kesi’s side is 55%, so 5% is unassigned. Set the label to 45% to reach exactly 100%.', basis: 'Split v5 draft and its edit history.' },
  ] }],
  ['/contracts', { title: 'Contracts', summary: '7 active agreements. The Glasshouse producer agreement waits on you, and the band agreement’s audit window closes Jan 9.', qa: [
    { q: 'Which terms in Marco’s agreement need me?', a: 'Clause 4.2 makes the $1,500 advance non-recoupable, and clause 5.2 gives Marco approval over remixes. Your playbook says the advance is recoupable from his royalties and he gets credit on remixes, not approval.', basis: 'Legal Agent’s review against your playbook.' },
  ] }],
  ['/rights', { title: 'Rights', summary: '3 MLC filings need you, and $312.40 is waiting to be claimed for “Night Bus”.', qa: [
    { q: 'What happens if I don’t file with the MLC?', a: 'Mechanical royalties for those songs stay unmatched. The MLC holds them, but there’s no reason to wait.', basis: 'The registrations tracker.' },
  ] }],
  ['/funding', { title: 'Funding', summary: 'One grant and two offers. The grant costs nothing and closes Nov 15; the sale is permanent.', qa: [
    { q: 'Which offer is cheaper?', a: 'The advance, by far: about $960 over 14 months. The sale costs about $12,000 over 5 years and keeps going.', basis: 'Your last 12 months of income, held flat. It’s an estimate.' },
    { q: 'Should I take the sale?', a: 'I wouldn’t without a buy-back clause. You’d give up half of Velvet Hours income for good. That’s your call, not mine.', basis: 'The offer documents from Nov 2 and Nov 4.' },
  ] }],
  ['/departments', { title: 'Departments', summary: '11 departments are on. Legal and Publishing are waiting on you; Audit is blocked on a stream report.', qa: [
    { q: 'What does Act within limits allow?', a: 'Routine tasks under the spend cap, like matching statement lines. Money, signatures, filings and public posts still come to you.', basis: 'Autonomy rules.' },
  ] }],
  ['/activity', { title: 'Activity log', summary: 'Everything agents and people did, newest first. One flag today: an unusual stream spike on “Night Bus”.', qa: [
    { q: 'Is the Night Bus spike fraud?', a: 'That pattern often means artificial streams. I haven’t confirmed it. No money is held while we ask the distributor.', basis: 'Audit Agent run RUN-88119.' },
  ] }],
  ['/settings', { title: 'Settings', summary: 'Every money, signature, filing and public action routes to Jana. Accounting’s connection has expired.', qa: [
    { q: 'Can someone else approve filings?', a: 'Yes. Filings already route to you or the Rights lead. Change it under Approval routing.', basis: 'Your approval routing.' },
  ] }],
  ['/roster', { title: 'Roster', summary: '3 artists and collaborators. Kesi Vale earned $10,812.60 in October.', qa: [
    { q: 'Who needs something from me?', a: 'Marco Dela, for the producer agreement. Rue Sato needs a new tax form before Dec 1.', basis: 'Open approvals and payee tax forms.' },
  ] }],
  ['/plan', { title: 'Plan preview', summary: 'This is a first draft from your goal. Nothing starts until you approve it.', qa: [
    { q: 'What happens when I approve?', a: 'I create the goal and a runbook with tasks per department. Anything that moves money, signs, files or goes public still comes back to you.', basis: 'How plans work.' },
  ] }],
  ['/', { title: 'Home', summary: 'Glasshouse is on track and on budget. Two terms in Marco’s agreement need your eyes. A grant closes in 9 days.', qa: [
    { q: 'What needs me this week?', a: 'Marco’s producer agreement by Nov 9, the October payout by Nov 10 and the MLC filing by Nov 12.', basis: 'Open approvals and their due dates.' },
    { q: 'How is Glasshouse doing?', a: 'On track for March 5 and on budget: $1,860.00 of $3,000.00 spent. The split sheets are the next thing to clear.', basis: 'The Glasshouse runbook and budget.' },
  ] }],
];

export function contextFor(path: string): ScreenContext {
  const hit = CONTEXTS.find(([p]) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/')));
  return hit ? hit[1] : CONTEXTS[CONTEXTS.length - 1][1];
}
