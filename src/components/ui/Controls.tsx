'use client';

import { Check } from 'lucide-react';
import { Tabs as RT, Tooltip as T } from 'radix-ui';
import { useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import s from './Controls.module.css';

/** 18px box (2d) on a real checkbox input, with a 44px hit area. */
export function Checkbox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cx(s.check, className)}>
      <input type="checkbox" {...rest} />
      <span className={s.box} aria-hidden="true">{rest.checked && <Check size={12} strokeWidth={3.5} />}</span>
    </span>
  );
}

/** Thin progress bar; `label` is the text equivalent read by screen readers. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={s.progress} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-valuetext={label} aria-label={label}>
      <div className={s.progressFill} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Wrap the app once so every tooltip shares one delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={200}>{children}</T.Provider>;
}

/**
 * Tooltip on hover and focus. Radix closes tooltips on scroll, and focusing a
 * trigger below the fold scrolls it into view, so while the trigger keeps focus
 * we ignore that close. Escape, blur and pointer leave still close it.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const escaped = useRef(false);
  return (
    <T.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !escaped.current && trigger.current && document.activeElement === trigger.current) return;
        escaped.current = false;
        setOpen(next);
      }}
    >
      <T.Trigger
        asChild
        ref={trigger}
        onKeyDown={(e) => { if (e.key === 'Escape') { escaped.current = true; setOpen(false); } }}
        onBlur={() => setOpen(false)}
      >
        {children}
      </T.Trigger>
      <T.Portal>
        <T.Content className={s.tip} sideOffset={6}>{content}</T.Content>
      </T.Portal>
    </T.Root>
  );
}

// Plain-language explanations for industry terms (brief: explain ISRC, MLC and PRO inline).
export const TERMS = {
  ISRC: 'International Standard Recording Code. The ID that follows a recording (master) everywhere it is sold or streamed.',
  UPC: 'Universal Product Code. The barcode ID for a release.',
  ISWC: 'International Standard Musical Work Code. The ID for a song (composition).',
  MLC: 'The Mechanical Licensing Collective. It pays songwriters and publishers for US streams and downloads of a song.',
  PRO: 'Performing rights organization, such as BMI or ASCAP. It pays songwriters when a song is played in public, on radio or streamed.',
  SoundExchange: 'Pays the owner of a recording and its performers for digital radio such as SiriusXM and Pandora.',
} as const;

/** An industry term with its explanation on hover and focus. */
export function Term({ term, children }: { term: keyof typeof TERMS; children?: ReactNode }) {
  return (
    <Tooltip content={TERMS[term]}>
      <button type="button" className={s.term}>{children ?? term}</button>
    </Tooltip>
  );
}

export { s as controlStyles };

// ---------------- Underline tabs (2d) ----------------

export type TabItem = { value: string; label: string; count?: number };

/** Underline tabs with a mono count. Content is passed as children (one panel). */
export function UnderlineTabs({ items, value, onChange, label, children }: {
  items: TabItem[]; value: string; onChange: (v: string) => void; label: string; children?: ReactNode;
}) {
  return (
    <RT.Root value={value} onValueChange={onChange} activationMode="manual">
      <RT.List className={s.tabs} aria-label={label}>
        {items.map((t) => (
          <RT.Trigger key={t.value} value={t.value} className={s.tab}>
            {t.label}{t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}
          </RT.Trigger>
        ))}
      </RT.List>
      {items.map((t) => (
        <RT.Content key={t.value} value={t.value} tabIndex={-1} style={{ outline: 'none' }}>
          {t.value === value ? children : null}
        </RT.Content>
      ))}
    </RT.Root>
  );
}
