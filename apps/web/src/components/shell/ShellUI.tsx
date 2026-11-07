'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandBar } from './CommandBar';
import { LabelHeadPanel } from './LabelHeadPanel';

export type Density = 'comfortable' | 'compact';
type Shell = {
  openCommand: (query?: string) => void;
  openPanel: (question?: string) => void;
  density: Density;
  setDensity: (d: Density) => void;
};

const Ctx = createContext<Shell | null>(null);
const DENSITY_KEY = 'br.density.v1';

/** Global ⌘K / Ctrl+K command bar, the Label Head panel and the density setting (Phase F). */
export function ShellUIProvider({ children, approvalIds }: { children: ReactNode; approvalIds: string[] }) {
  const [cmd, setCmd] = useState<{ open: boolean; query: string }>({ open: false, query: '' });
  const [panel, setPanel] = useState<{ open: boolean; question?: string }>({ open: false });
  const [density, setDensityState] = useState<Density>('comfortable');
  // The control that opened a dialog gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const remember = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };

  const openCommand = useCallback((query = '') => { remember(); setPanel({ open: false }); setCmd({ open: true, query }); }, []);
  const openPanel = useCallback((question?: string) => { remember(); setCmd({ open: false, query: '' }); setPanel({ open: true, question }); }, []);
  const restore = () => { const el = opener.current; opener.current = null; if (el && document.contains(el)) requestAnimationFrame(() => el.focus()); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommand(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCommand]);

  useEffect(() => {
    try { const d = localStorage.getItem(DENSITY_KEY); if (d === 'compact') setDensityState('compact'); } catch { /* storage off */ }
  }, []);
  useEffect(() => {
    if (density === 'compact') document.documentElement.dataset.density = 'compact';
    else delete document.documentElement.dataset.density;
  }, [density]);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({ openCommand, openPanel, density, setDensity }), [openCommand, openPanel, density, setDensity]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandBar open={cmd.open} initialQuery={cmd.query} onClose={() => { setCmd({ open: false, query: '' }); restore(); }} onAsk={(q) => { setCmd({ open: false, query: '' }); setPanel({ open: true, question: q }); }} />
      <LabelHeadPanel open={panel.open} question={panel.question} approvalIds={approvalIds} onClose={() => { setPanel({ open: false }); restore(); }} />
    </Ctx.Provider>
  );
}

/** Outside the app shell (the payee portal, the gallery) these do nothing. */
const fallback: Shell = { openCommand: () => undefined, openPanel: () => undefined, density: 'comfortable', setDensity: () => undefined };
export function useShellUI(): Shell { return useContext(Ctx) ?? fallback; }
