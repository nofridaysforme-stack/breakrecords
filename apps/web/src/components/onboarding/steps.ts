// The 9 onboarding steps (screens.md 2a). Profiles and "Turns on" copy from frame 2a.
export const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'profile', label: 'Profile' },
  { id: 'name', label: 'Name' },
  { id: 'country', label: 'Country' },
  { id: 'distributor', label: 'Distributor' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'pro', label: 'PRO' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'finish', label: 'Finish' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];
export const stepIndex = (id: string) => STEPS.findIndex((s) => s.id === id);

export const PROFILES = [
  { id: 'solo', name: 'Solo artist', who: 'You release your own music and want the business handled.', on: 'Releases, Royalties, Rights, Funding' },
  { id: 'band', name: 'Band', who: 'Several co-owners who need fair, visible splits.', on: 'Everything in Solo, plus shared split signing' },
  { id: 'small_label', name: 'Small label', who: '2 to 10 artists, one owner calling the shots.', on: 'Roster, deal templates, statements, payouts' },
  { id: 'growing_label', name: 'Growing label', who: 'A label with some human staff.', on: 'Everything in Small label, plus roles and approval chains' },
  { id: 'services', name: 'Label services', who: 'You run releases for artists you do not own.', on: 'Client separation, service fees, client statements' },
] as const;
export type ProfileId = (typeof PROFILES)[number]['id'];

export const DISTRIBUTORS = ['DistroKid', 'TuneCore', 'CD Baby', 'AWAL', 'UnitedMasters', 'Another distributor'];
export const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'Another country'];
export const PROS = ['BMI', 'ASCAP', 'SESAC', 'GMR', 'SOCAN', 'PRS for Music', 'APRA AMCOS'];
