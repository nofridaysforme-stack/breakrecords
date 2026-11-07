import type { ElementType, ReactNode } from 'react';
import s from './Type.module.css';

type Props = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  id?: string;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** Mono, uppercase label above a section or card. 11px by default, 12px with `large`. */
export function Eyebrow({ as: As = 'div', className, large, children, id }: Props & { large?: boolean }) {
  return <As id={id} className={cx(s.eyebrow, large && s.eyebrowLg, className)}>{children}</As>;
}

export function Body({ as: As = 'p', className, children, id }: Props) {
  return <As id={id} className={cx(s.body, className)}>{children}</As>;
}

export function Meta({ as: As = 'p', className, children, id }: Props) {
  return <As id={id} className={cx(s.meta, className)}>{children}</As>;
}

export function CardTitle({ as: As = 'h3', className, children, id }: Props) {
  return <As id={id} className={cx(s.cardTitle, className)}>{children}</As>;
}

export function SectionHead({ as: As = 'h2', className, children, id }: Props) {
  return <As id={id} className={cx(s.sectionHead, className)}>{children}</As>;
}

export function PageTitle({ as: As = 'h1', className, children, id }: Props) {
  return <As id={id} className={cx(s.pageTitle, className)}>{children}</As>;
}

/** 40px brief greeting; `xl` gives 52px for release titles. */
export function Hero({ as: As = 'h1', className, xl, children, id }: Props & { xl?: boolean }) {
  return <As id={id} className={cx(s.hero, xl && s.heroXl, className)}>{children}</As>;
}

/** Large tabular figure, for the numbers row and totals. */
export function BigNumber({ as: As = 'div', className, children, id }: Props) {
  return <As id={id} className={cx(s.number, className)}>{children}</As>;
}
