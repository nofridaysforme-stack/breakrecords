import 'server-only';
import type { Module } from '@breakrecords/contract';

/**
 * Which API areas use the live backend (strategy: "Flip modules with a flag").
 * BR_LIVE_MODULES=approvals,catalog turns those on; everything else stays on the mock.
 * Staging runs everything live; production flips one module per gate.
 */
export function isLive(module: Module): boolean {
  return (process.env.BR_LIVE_MODULES ?? '').split(',').map((s) => s.trim()).includes(module);
}

export class ModuleNotLive extends Error {
  constructor(public module: Module) { super(`The ${module} module has no live backend yet. Unset it in BR_LIVE_MODULES to use the mock.`); }
}

/** What each module is, in the words the app uses, for the "not saved" banner and the status check. */
export const MODULE_LABEL: Record<Module, string> = {
  approvals: 'Approvals', catalog: 'Catalog and People', contracts: 'Contracts', roster: 'Roster', splits: 'Splits', statements: 'Statements and Royalties',
  payouts: 'Payouts', registrations: 'Rights', releases: 'Releases', funding: 'Funding', activity: 'Departments, agents and plans', settings: 'Settings', documents: 'Documents',
};

/** Modules still on sample data. On a signed-in deployment, anything done there isn't saved. */
export async function sampleModules(): Promise<Module[]> {
  const { MODULES } = await import('@breakrecords/contract');
  return MODULES.filter((m) => !isLive(m));
}
