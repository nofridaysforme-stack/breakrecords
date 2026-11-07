import type { ReactNode } from 'react';
import { RailToggle } from './RailToggle';
import s from './Page.module.css';

type Props = {
  children: ReactNode;
  /** Optional right rail (310px). Inline at 1360px and up, a drawer below. */
  rail?: ReactNode;
  /** Names the rail for its toggle and drawer, for example "Agent activity". */
  railLabel?: string;
};

export function Page({ children, rail, railLabel = 'Details' }: Props) {
  return (
    <div className={`${s.page} ${rail ? s.withRail : ''}`}>
      <main id="main" className={s.main}>{children}</main>
      {rail && (
        <>
          <aside className={s.rail} aria-label={railLabel}>{rail}</aside>
          <RailToggle label={railLabel}>{rail}</RailToggle>
        </>
      )}
    </div>
  );
}
