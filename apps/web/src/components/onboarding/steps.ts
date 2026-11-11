// The 9 onboarding steps (screens.md 2a). Every tool is available to every profile: a profile only
// sets the starting point (what Home leads with, defaults and wording), never what's switched on.
export const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'profile', label: 'Profile' },
  { id: 'name', label: 'Name' },
  { id: 'country', label: 'Country' },
  { id: 'distributor', label: 'Distributor' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'songwriting', label: 'Songwriting' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'finish', label: 'Finish' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];
export const stepIndex = (id: string) => STEPS.findIndex((s) => s.id === id);

export const PROFILES = [
  { id: 'solo', name: 'Solo artist', who: 'You release your own music and want the business handled.', starts: 'Your next release, money coming in, unclaimed money' },
  { id: 'band', name: 'Band', who: 'Several co-owners who need fair, visible splits.', starts: 'Split status and each member’s share' },
  { id: 'small_label', name: 'Small label', who: '2 to 10 artists, one owner calling the shots.', starts: 'Approvals and how your roster is doing' },
  { id: 'growing_label', name: 'Growing label', who: 'A label with some human staff.', starts: 'Your team’s queue and who approves what' },
  { id: 'services', name: 'Label services', who: 'You run releases for artists you do not own.', starts: 'Your client list and what’s due for each client' },
] as const;
export type ProfileId = (typeof PROFILES)[number]['id'];

export const DISTRIBUTORS = ['DistroKid', 'TuneCore', 'CD Baby', 'AWAL', 'UnitedMasters', 'Another distributor'];
export const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'Another country'];
export const PROS = ['BMI', 'ASCAP', 'SESAC', 'GMR', 'SOCAN', 'PRS for Music', 'APRA AMCOS'];

/** Who owns or administers the songs, as each kind of profile would put it. */
export const PUBLISHING: Record<'artist' | 'label', { id: 'self' | 'publisher' | 'we_publish' | 'we_administer' | 'writers_own'; label: string; hint: string }[]> = {
  artist: [
    { id: 'self', label: 'I publish my own songs', hint: 'You register your songs yourself, with your PRO and the MLC.' },
    { id: 'publisher', label: 'A publisher handles my songs', hint: 'Your publisher registers them. I prepare what they need.' },
  ],
  label: [
    { id: 'we_publish', label: 'We publish our writers’ songs', hint: 'You file as publisher, for writers with a signed publishing agreement.' },
    { id: 'we_administer', label: 'We administer their publishing', hint: 'You file for writers with a signed admin agreement. They keep ownership.' },
    { id: 'writers_own', label: 'Writers handle their own', hint: 'You never file as publisher. I prepare packets for each writer to submit.' },
  ],
};
export const PUBLISHING_LABEL: Record<string, string> = {
  self: 'Self-published', publisher: 'Has a publisher', we_publish: 'We publish', we_administer: 'We administer', writers_own: 'Writers handle their own',
};
/** The starting choice: artists publish their own, services leave it to the writers, labels choose. */
export const defaultPublishing = (profile: string) => (profile === 'solo' || profile === 'band' ? 'self' : profile === 'services' ? 'writers_own' : 'we_administer');
