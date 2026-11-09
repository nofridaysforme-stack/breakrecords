'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  members?: string[]; // a band's other members (emails), who become co-owners
};

// Defaults match the sample label so the mockup flow reads the same as 2a and 2b.
const DEFAULTS: Answers = {
  profile: 'small_label', name: 'Northline Records', country: 'United States', distributor: 'DistroKid',
  catalogFile: 'northline-catalog.csv', pro: { status: 'affiliated', org: 'BMI' }, autonomy: 'draft_and_wait',
};
const KEY = 'br.onboarding.v1';

/** Saves the answers on the server as you go (and in this tab, so a slow network loses nothing). */
export function useOnboarding() {
  const [answers, setAnswers] = useState<Answers>(DEFAULTS);
  const [live, setLive] = useState(false); // a real workspace: blank start, no sample import
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // This tab's copy is the newest; the server's fills in on a new device or browser.
  useEffect(() => {
    let local: string | null = null;
    try { local = sessionStorage.getItem(KEY); if (local) setAnswers({ ...DEFAULTS, ...JSON.parse(local) }); } catch { /* ignore */ }
    fetch('/api/onboarding').then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (b?.live) setLive(true);
      if (local) return; // this tab's copy is newer
      if (b?.answers) setAnswers({ ...(b.defaults ?? DEFAULTS), ...b.answers });
      else if (b?.defaults) setAnswers(b.defaults);
    }).catch(() => { /* keep the defaults */ });
  }, []);
  const save = useCallback((next: Answers, complete = false) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return fetch('/api/onboarding', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: next, ...(complete ? { complete: true } : {}) }), keepalive: true })
      .then((r) => r.ok).catch(() => false);
  }, []);
  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void save(next); }, 300);
      return next;
    });
  }, [save]);
  /** Sets the label up from the answers. */
  const complete = useCallback(() => { if (timer.current) clearTimeout(timer.current); return save(answers, true); }, [answers, save]);
  return { answers, set, complete, live };
}
