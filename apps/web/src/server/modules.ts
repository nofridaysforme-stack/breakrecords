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
