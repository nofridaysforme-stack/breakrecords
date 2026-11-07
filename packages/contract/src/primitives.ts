// Shared building blocks. Money is always integer cents; shares are basis points (10000 = 100%).
import { z } from 'zod';

export const Cents = z.number().int();
export const Bp = z.number().int().min(0).max(10000);
/** "2026-11-10". */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** "2026-11-07T14:27:36.000Z". */
export const IsoDateTime = z.iso.datetime();
export const Id = z.string().min(1);

/** Which data condition a screen shows (flows.md > States). */
export const Scenario = z.enum(['default', 'empty', 'working', 'blocked', 'error', 'partial']);

/**
 * v1 display field: a string the mock pre-formats for the screen ("Nov 10", "86%", "Up to $5,000").
 * Frozen as-is so the UI keeps working; each module replaces these with structured values
 * (ISO dates, cents, basis points) when it goes live.
 */
export const Display = z.string();

export const RegistrationStatus = z.enum(['notStarted', 'prepared', 'needsYou', 'submitted', 'confirmed', 'blocked']);
export const AgentState = z.enum(['idle', 'working', 'waitingOnYou', 'blocked', 'done']);
export const TaskState = z.enum(['done', 'inProgress', 'needsYou', 'waiting', 'locked']);
export const Autonomy = z.enum(['observe', 'suggest', 'draft_and_wait', 'act_within_limits']);
