'use client';

import { useRef, type ReactNode } from 'react';
import { PanelRight, X } from 'lucide-react';
import s from './Page.module.css';

/** Below 1360px the right rail moves into a drawer opened by this button. */
export function RailToggle({ label, children, hideOnPhone }: { label: string; children: ReactNode; hideOnPhone?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`${s.toggle} ${hideOnPhone ? s.toggleDesk : ''}`} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        <PanelRight size={16} aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={ref}
        className={s.drawer}
        aria-label={label}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className={s.drawerHead}>
          <span className="visually-hidden">{label}</span>
          <span />
          <button type="button" className={s.close} aria-label={`Close ${label.toLowerCase()}`} onClick={() => ref.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={s.drawerBody}>{children}</div>
      </dialog>
    </>
  );
}
