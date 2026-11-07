import type { ReactNode } from 'react';
import { RailToggle } from './RailToggle';
import s from './Page.module.css';

type Props = {
  children: ReactNode;
  /** Optional right rail (310px). Inline at 1360px and up, a drawer below. */
  rail?: ReactNode;
  /** Names the rail for its toggle and drawer, for example "Agent activity". */
  railLabel?: string;
  /** Show the rail's drawer button on phones. 2h has none, so Home turns it off. */
  railOnPhone?: boolean;
  /** The screen lays out its own columns and padding (approval detail). */
  bare?: boolean;
};

export function Page({ children, rail, railLabel = 'Details', railOnPhone = true, bare }: Props) {
  if (bare) return <main id="main" className={s.bare}>{children}</main>;
  return (
    <div className={`${s.page} ${rail ? s.withRail : ''}`}>
      <main id="main" className={s.main}>{children}</main>
      {rail && (
        <>
          <aside className={s.rail} aria-label={railLabel}>{rail}</aside>
          <RailToggle label={railLabel} hideOnPhone={!railOnPhone}>{rail}</RailToggle>
        </>
      )}
    </div>
  );
}
