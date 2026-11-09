'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { AutonomyDial, type Autonomy } from '@/components/ui/AutonomyDial';
import { Eyebrow } from '@/components/type/Type';
import { Term } from '@/components/ui/Controls';
import { cx } from '@/components/ui/cx';
import { COUNTRIES, DISTRIBUTORS, PROFILES, PROS, STEPS, stepIndex, type StepId } from './steps';
import { useOnboarding, type Answers } from './useOnboarding';
import s from './Onboarding.module.css';

const FOCUS_KEY = 'br.onboarding.focus';

const PANEL: Record<Autonomy, string> = {
  observe: 'With "Observe", I watch and report. I won’t prepare anything until you ask.',
  suggest: 'With "Suggest", I tell you what I would do next. You do the work.',
  draft_and_wait: 'With "Draft and wait", I prepare the producer agreement, the split sheet and the MLC filing. Nothing goes out until you press Approve.',
  act_within_limits: 'With "Act within limits", I finish routine tasks under the spend caps you set. Money, signatures, filings and anything public still come to you.',
};

function summary(a: Answers): [string, string][] {
  return [
    ['Profile', PROFILES.find((p) => p.id === a.profile)?.name ?? ''],
    ['Name', a.name || 'Not set yet'],
    ['Country', a.country],
    ['Distributor', a.distributor ? 'Connected' : 'Skipped for now'],
    ['Catalog', a.catalogFile ? '14 recordings imported' : 'Skipped for now'],
    ['PRO', a.pro.status === 'affiliated' ? 'Affiliated' : a.pro.status === 'not_yet' ? 'Not yet' : 'Not sure'],
  ];
}

export function Onboarding({ step }: { step: StepId }) {
  const router = useRouter();
  const { answers, set, complete } = useOnboarding();
  const i = stepIndex(step);
  const go = async (to: number) => {
    if (to >= STEPS.length) await complete(); // finishing sets the label up from the answers
    try { sessionStorage.setItem(FOCUS_KEY, '1'); } catch { /* ignore */ }
    router.push(to >= STEPS.length ? '/?state=empty' : `/onboarding/${STEPS[Math.max(0, to)].id}`);
  };
  const heading = useRef<HTMLHeadingElement>(null);
  // After Back or Continue, move focus to the new step's heading so screen readers
  // announce it. Not on a fresh page load.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FOCUS_KEY)) { sessionStorage.removeItem(FOCUS_KEY); heading.current?.focus(); }
    } catch { /* ignore */ }
  }, [step]);
  const profileName = PROFILES.find((p) => p.id === answers.profile)?.name ?? '';

  if (step === 'autonomy') {
    return (
      <div className={s.split}>
        <main className={s.splitMain} id="main">
          <p className={s.stepMono}>{i + 1} / {STEPS.length} · How much should your staff do alone?</p>
          <h1 ref={heading} tabIndex={-1} className={s.title} style={{ maxWidth: 720 }}>Set how much your agents do before checking with you.</h1>
          <div className={s.dial}>
            <AutonomyDial layout="list" value={answers.autonomy} onChange={(v) => set('autonomy', v)} recommended="draft_and_wait" legend="How much should your staff do alone?" />
          </div>
        </main>
        <aside className={s.panel} aria-label="Label Head">
          <p className={s.panelEyebrow}><span className={s.square} aria-hidden="true" />Label Head</p>
          <p className={s.panelText} aria-live="polite">{PANEL[answers.autonomy]}</p>
          <div className={s.setSoFar}>
            <h2 className={s.setLabel}>You&apos;ve set so far</h2>
            <dl className={s.setGrid}>
              {summary(answers).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className={s.setKey}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
            </dl>
          </div>
          <div className={s.panelActions}>
            <Button variant="onBrand" size="lg" onClick={() => go(i - 1)}>Back</Button>
            <Button variant="primary" size="lg" onClick={() => go(i + 1)}>Continue</Button>
          </div>
        </aside>
      </div>
    );
  }

  const shell = (opts: { title: string; lede?: string; body: ReactNode; next?: string; canSkip?: () => void }) => (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.brand}><span className={s.mark} aria-hidden="true">I</span><span className={s.wordmark}>Indie SRVCS.</span></div>
        <div className={s.progress} role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1} aria-valuetext={`Step ${i + 1} of ${STEPS.length}: ${STEPS[i].label}`}>
          {STEPS.map((st, k) => <span key={st.id} className={cx(s.bar, k < i && s.barDone, k === i && s.barNow)} aria-hidden="true" />)}
          <span className={s.stepText} aria-hidden="true">{i + 1} / {STEPS.length} · {STEPS[i].label}</span>
        </div>
        <p className={s.time}>{i === STEPS.length - 1 ? 'Done' : `About ${10 - (i + 1)} minutes left`}</p>
      </header>
      <main className={s.main} id="main">
        <div className={s.intro}>
          <h1 ref={heading} tabIndex={-1} className={s.title}>{opts.title}</h1>
          {opts.lede && <p className={s.lede}>{opts.lede}</p>}
        </div>
        {opts.body}
      </main>
      <footer className={s.footer}>
        {i > 0 ? <Button size="lg" onClick={() => go(i - 1)}>Back</Button> : <span />}
        <p className={s.footNote}>Everything here is editable later.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {opts.canSkip && <Button size="lg" onClick={opts.canSkip}>Skip for now</Button>}
          <Button variant="primary" size="lg" onClick={() => go(i + 1)}>{opts.next ?? 'Continue'}</Button>
        </div>
      </footer>
    </div>
  );

  switch (step) {
    case 'welcome':
      return shell({
        title: 'Let’s set up your label.',
        lede: 'It takes about 10 minutes. I’ll ask a few questions, then your team of agents gets to work. They prepare everything; you approve what matters.',
        next: 'Get started',
        body: (
          <ol className={s.welcomeList}>
            {['Tell me how you put out music and what to call you.', 'Connect what you already use: your distributor, catalog and PRO.', 'Choose how much your agents do before checking with you.'].map((t, k) => (
              <li key={t}><span className={s.welcomeNum}>0{k + 1}</span>{t}</li>
            ))}
          </ol>
        ),
      });
    case 'profile':
      return shell({
        title: 'How do you put out music?',
        lede: 'Your pick decides which departments switch on. You can change it any time in Settings.',
        next: `Continue as ${profileName}`,
        body: (
          <fieldset className={s.profiles}>
            <legend className="visually-hidden">Profile</legend>
            {PROFILES.map((p) => (
              <label key={p.id} className={s.profile}>
                <input type="radio" name="profile" value={p.id} checked={answers.profile === p.id} onChange={() => set('profile', p.id)} />
                <span className={s.profileTop}><span className={s.radio} aria-hidden="true"><span className={s.radioDot} /></span><span className={s.selected} aria-hidden="true">Selected</span></span>
                <span className={s.profileName}>{p.name}</span>
                <span className={s.profileWho}>{p.who}</span>
                <span className={s.turnsOn}><Eyebrow as="span">Turns on</Eyebrow><span className={s.turnsOnText}>{p.on}</span></span>
              </label>
            ))}
          </fieldset>
        ),
      });
    case 'name':
      return shell({
        title: answers.profile === 'solo' ? 'What name do you release under?' : 'What’s your label called?',
        lede: 'This shows on statements, contracts and anything I send for you.',
        body: (
          <div className={s.form}>
            <label className={s.field}>Name
              <input className={s.input} value={answers.name} onChange={(e) => set('name', e.target.value)} autoComplete="organization" />
            </label>
          </div>
        ),
      });
    case 'country':
      return shell({
        title: 'Where is your label based?',
        lede: 'This sets your tax forms, collection societies and the currency on statements.',
        body: (
          <div className={s.form}>
            <label className={s.field}>Home country
              <select className={s.select} value={answers.country} onChange={(e) => set('country', e.target.value)}>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        ),
      });
    case 'distributor':
      return shell({
        title: 'Who distributes your music now?',
        lede: 'Connecting lets me import your statements and catalog. You can skip this and connect later.',
        canSkip: () => { set('distributor', null); go(i + 1); },
        body: (
          <fieldset className={s.choices}>
            <legend className="visually-hidden">Distributor</legend>
            {DISTRIBUTORS.map((d) => (
              <label key={d} className={s.choice}>
                <input type="radio" name="distributor" checked={answers.distributor === d} onChange={() => set('distributor', d)} />{d}
              </label>
            ))}
          </fieldset>
        ),
      });
    case 'catalog':
      return shell({
        title: 'Bring in your catalog.',
        lede: 'Upload an export from your distributor (CSV or XLSX). I match recordings, songs and splits and show you anything I couldn’t place.',
        canSkip: () => { set('catalogFile', null); go(i + 1); },
        body: (
          <div className={s.drop}>
            <label className={s.field} style={{ alignItems: 'center' }}>
              <span>Choose a catalog file</span>
              <input type="file" accept=".csv,.xlsx" className={s.input} style={{ height: 'auto', padding: 12 }} onChange={(e) => set('catalogFile', e.target.files?.[0]?.name ?? null)} />
            </label>
            {answers.catalogFile && <p className={s.fileName}>✓ {answers.catalogFile}</p>}
            <p className={s.hint}>Nothing is changed in your distributor account.</p>
          </div>
        ),
      });
    case 'pro':
      return shell({
        title: 'Are you with a PRO?',
        lede: 'A PRO pays songwriters when their songs are played in public or streamed.',
        body: (
          <div className={s.form} style={{ maxWidth: 760 }}>
            <p className={s.hint}>What is a <Term term="PRO" />?</p>
            <fieldset className={s.choices}>
              <legend className="visually-hidden">PRO status</legend>
              {([['affiliated', 'Yes, I’m affiliated'], ['not_yet', 'Not yet'], ['not_sure', 'I’m not sure']] as const).map(([v, l]) => (
                <label key={v} className={s.choice}>
                  <input type="radio" name="pro" checked={answers.pro.status === v} onChange={() => set('pro', { ...answers.pro, status: v })} />{l}
                </label>
              ))}
            </fieldset>
            {answers.pro.status === 'affiliated' && (
              <label className={s.field}>Which one?
                <select className={s.select} value={answers.pro.org} onChange={(e) => set('pro', { status: 'affiliated', org: e.target.value })}>
                  {PROS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            )}
            {answers.pro.status !== 'affiliated' && <p className={s.hint}>That’s fine. I’ll check whether your songs are registered anywhere and suggest a next step.</p>}
          </div>
        ),
      });
    case 'finish':
      return shell({
        title: `${answers.name || 'Your label'} is set up.`,
        lede: 'Your agents are importing what you connected. Tell me a goal on Home and I’ll come back with a plan.',
        next: 'Go to Home',
        body: (
          <dl className={s.summary}>
            {[...summary(answers), ['Autonomy', ({ observe: 'Observe', suggest: 'Suggest', draft_and_wait: 'Draft and wait', act_within_limits: 'Act within limits' } as const)[answers.autonomy]] as [string, string]].map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}><dt className={s.summaryKey}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>
            ))}
          </dl>
        ),
      });
    default:
      return null;
  }
}

