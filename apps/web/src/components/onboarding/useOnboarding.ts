'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Autonomy } from '@/components/ui/AutonomyDial';
import type { ProfileId } from './steps';

export type Answers = {
  profile: ProfileId;
  name: string;
  country: string;
  distributor: string | null; // null = skipped
  catalogFile: string | null;
  pro: { status: 'affiliated' | 'not_yet' | 'not_sure'; org?: string };
  autonomy: Autonomy;
};

// Defaults match the sample label so the mockup flow reads the same as 2a and 2b.
const DEFAULTS: Answers = {
  profile: 'small_label', name: 'Northline Records', country: 'United States', distributor: 'DistroKid',
  catalogFile: 'northline-catalog.csv', pro: { status: 'affiliated', org: 'BMI' }, autonomy: 'draft_and_wait',
};
const KEY = 'br.onboarding.v1';

export function useOnboarding() {
  const [answers, setAnswers] = useState<Answers>(DEFAULTS);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(KEY); if (raw) setAnswers({ ...DEFAULTS, ...JSON.parse(raw) }); } catch { /* ignore */ }
  }, []);
  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { answers, set };
}
