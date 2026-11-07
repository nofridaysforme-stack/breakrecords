'use client';

import { useId } from 'react';
import { cx } from './cx';
import s from './AutonomyDial.module.css';

export type Autonomy = 'observe' | 'suggest' | 'draft_and_wait' | 'act_within_limits';

const STOPS: { id: Autonomy; name: string; short: string; long: string }[] = [
  { id: 'observe', name: 'Observe', short: 'Watch and report', long: 'Agents watch and report. They prepare nothing.' },
  { id: 'suggest', name: 'Suggest', short: 'Say what it would do', long: 'Agents tell you what they would do. You do the work.' },
  { id: 'draft_and_wait', name: 'Draft and wait', short: 'Prepare, wait for you', long: 'Agents prepare the work and wait for your approval.' },
  { id: 'act_within_limits', name: 'Act within limits', short: 'Finish routine tasks under caps', long: 'Agents finish routine tasks under spend caps you set.' },
];

type Props = {
  value: Autonomy;
  onChange: (v: Autonomy) => void;
  /** "segmented" for Departments (5f), "list" for onboarding (2b). */
  layout?: 'segmented' | 'list';
  legend?: string;
  /** Stops that are off, each with the reason shown under the dial. */
  disabled?: Partial<Record<Autonomy, string>>;
  /** One line under the dial, for example what this department can do alone. */
  note?: string;
  recommended?: Autonomy;
};

/**
 * Four stops on a native radio group, so arrow keys move between them.
 * Always reminds that money, signatures, filings and public posts still need approval.
 */
export function AutonomyDial({ value, onChange, layout = 'segmented', legend = 'Autonomy', disabled = {}, note, recommended }: Props) {
  const name = useId();
  const reminderId = `${name}-reminder`;
  const reasons = Object.entries(disabled).filter(([, why]) => why);
  return (
    <fieldset className={s.fieldset} aria-describedby={reminderId}>
      <legend className={layout === 'list' ? 'visually-hidden' : s.legend}>{legend}</legend>
      <div className={layout === 'list' ? s.list : s.segmented}>
        {STOPS.map((stop, i) => {
          const off = Boolean(disabled[stop.id]);
          const input = (
            <input
              className={s.input} type="radio" name={name} value={stop.id}
              checked={value === stop.id} disabled={off} onChange={() => onChange(stop.id)}
            />
          );
          return layout === 'list' ? (
            <label key={stop.id} className={s.option}>
              {input}
              <span className={s.optNum} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span><span className={s.optName}>{stop.name}</span><span className={cx(s.optDesc)} style={{ display: 'block' }}>{stop.long}</span></span>
              {recommended === stop.id && <span className={s.optTag}>Recommended</span>}
            </label>
          ) : (
            <label key={stop.id} className={s.seg}>
              {input}
              <span className={s.segName}>{stop.name}</span>
              <span className={s.segDesc}>{stop.short}</span>
            </label>
          );
        })}
      </div>
      {reasons.map(([id, why]) => (
        <p key={id} className={s.note}>{STOPS.find((x) => x.id === id)?.name}: {why}</p>
      ))}
      {note && <p className={s.note}>{note}</p>}
      <p id={reminderId} className={layout === 'list' ? s.reminder : s.note}>
        Money, signatures, filings and anything public always come to you as an approval, at every level.
      </p>
    </fieldset>
  );
}
