import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import s from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'onBrand' | 'destructive' | 'ghost';
type Common = {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Full width and 48px tall on phones. */
  mobileFull?: boolean;
  className?: string;
  children: ReactNode;
};

const classes = ({ variant = 'secondary', size = 'md', block, mobileFull, className }: Omit<Common, 'children'>) =>
  cx(s.btn, s[variant], size !== 'md' && s[size], block && s.block, mobileFull && s.mobileFull, className);

/**
 * One primary per decision surface. Disabled buttons must sit next to text that
 * says why (components.md): pass `disabledReason` and it is linked with aria-describedby.
 */
export function Button({
  variant, size, block, mobileFull, className, children, disabledReason, ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement> & { disabledReason?: string }) {
  const reasonId = rest.disabled && disabledReason ? `${rest.id ?? 'btn'}-why` : undefined;
  return (
    <>
      <button type="button" {...rest} aria-describedby={reasonId ?? rest['aria-describedby']} className={classes({ variant, size, block, mobileFull, className })}>
        {children}
      </button>
      {reasonId && <span id={reasonId} className="visually-hidden">{disabledReason}</span>}
    </>
  );
}

export function ButtonLink({ href, variant, size, block, mobileFull, className, children, ...rest }: Common & { href: string; 'aria-label'?: string }) {
  return (
    <Link href={href} {...rest} className={classes({ variant, size, block, mobileFull, className })}>
      {children}
    </Link>
  );
}
