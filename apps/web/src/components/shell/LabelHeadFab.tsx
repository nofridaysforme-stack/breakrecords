'use client';

import { MessageSquare } from 'lucide-react';
import { useShellUI } from './ShellUI';
import s from './AppShell.module.css';

/** Phones have no sidebar, so the Label Head opens from this button above the tab bar. */
export function LabelHeadFab() {
  const { openPanel } = useShellUI();
  return (
    <button type="button" className={s.fab} onClick={() => openPanel()} aria-haspopup="dialog">
      <MessageSquare size={16} aria-hidden="true" />Label Head
    </button>
  );
}
