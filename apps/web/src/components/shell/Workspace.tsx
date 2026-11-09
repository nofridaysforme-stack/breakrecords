'use client';

import { createContext, useContext, type ReactNode } from 'react';

// What kind of workspace this is, and the words that go with it. Artist workspaces (solo
// artists and bands) say "your personal label" where it reads naturally, and "team" for the
// people in it; labels and licensees keep "label".
export type WorkspaceKind = 'artist' | 'label' | 'licensee';

export const WORDS = {
  artist: { kicker: 'Personal label', your: 'your personal label', people: 'your team', member: 'works with you', catalogOf: 'your music' },
  label: { kicker: 'Label', your: 'your label', people: 'the label’s team', member: 'works in the label', catalogOf: 'every artist on the label' },
  licensee: { kicker: 'Label', your: 'your label', people: 'the label’s team', member: 'works in the label', catalogOf: 'every artist on the label' },
} satisfies Record<WorkspaceKind, Record<string, string>>;

const Ctx = createContext<WorkspaceKind>('label');

export function WorkspaceProvider({ kind, children }: { kind: WorkspaceKind; children: ReactNode }) {
  return <Ctx.Provider value={kind}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => { const kind = useContext(Ctx); return { kind, words: WORDS[kind], isArtist: kind === 'artist' }; };
